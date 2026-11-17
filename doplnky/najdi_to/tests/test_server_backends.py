import importlib.util
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

PLUGIN_DIR = Path(__file__).resolve().parents[1]
ROOT = PLUGIN_DIR.parents[1]
sys.path.insert(0, str(ROOT))

import plugins  # noqa: E402


def _dummy_project_xy(lat: float, lon: float, is_world: bool = False):
    return [round(lon * 100.0, 1), round(lat * 100.0, 1)]


class TestNajdiToServerBackends(unittest.TestCase):
    def test_najdi_to_php_and_python_backends(self):
        php_bin = shutil.which('php')
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            assets = tmp / 'assets'
            site = tmp / 'site'
            build = tmp / 'build'
            server_root = tmp / 'site_server'
            (assets / 'doplnky').mkdir(parents=True)
            # Multi-level data pro test per-level TOP 10 + profanity filtru + 1 pokusu
            sample = json.loads((PLUGIN_DIR / 'priklady/najdi_to.json').read_text(encoding='utf-8'))
            sample['levels'].append({
                'lvl': 2,
                'text': 'Druhá úroveň',
                'camera': [50.77, 15.06, 1.2],
                'questions': [
                    {'id': 'divadlo', 'text': 'Najdeš divadlo?', 'lat': 50.7705, 'lon': 15.0595, 'radius': 35, 'answer': 'Divadlo F. X. Šaldy'}
                ],
            })
            (assets / 'doplnky/najdi_to.json').write_text(json.dumps(sample, ensure_ascii=False), encoding='utf-8')
            targets_path = server_root / 'server_data/najdi_to.targets.json'
            (assets / 'doplnky.json').write_text(
                json.dumps({
                    'najdi_to': {
                        'enabled': True,
                        'mode': 'server',
                        'server_url': 'api/najdi_to.php',
                        'private': {'server_data_out': str(targets_path)},
                    }
                }),
                encoding='utf-8',
            )
            plugins.load_and_run_plugins(
                {'nazev': 'TestMěsto'},
                {'mpp': 0.2, 'w': 4000, 'h': 2000},
                _dummy_project_xy,
                assets_dir=assets,
                site_dir=site,
                build_dir=build,
                plugins_dir=ROOT / 'doplnky',
                libs_dir=ROOT / 'knihovny',
            )
            targets = json.loads(targets_path.read_text(encoding='utf-8'))
            self.assertTrue(targets['profanity_filter'])
            self.assertTrue(targets['one_attempt_only'])

            # Python backend: per-level submit_level + TOP 10 limit + profanity odmítnutí + 1 pokus
            spec = importlib.util.spec_from_file_location(
                'najdi_to_server', PLUGIN_DIR / 'server/python/najdi_to_server.py'
            )
            nt_py = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(nt_py)

            conn = sqlite3.connect(tmp / 'py.sqlite')
            prof_rules = nt_py.load_profanity_rules(targets_path)

            def play_py_level(lvl_num: int, nick: str, base_ms: int, step_ms: int = 500, client_ip: str = '127.0.0.1'):
                code, st = nt_py.handle_action({'action': 'start', 'levelId': lvl_num}, targets, conn, 'secret_py', client_ip=client_ip, now_ms=base_ms, profanity_rules=prof_rules)
                self.assertEqual(code, 200)
                ticket = st['ticket']
                t_ms = base_ms + step_ms
                qs = targets['levels'][lvl_num - 1]['questions']
                for idx in st['order']:
                    q = qs[idx]
                    _, r = nt_py.handle_action({'action': 'verify', 'x': q['xy'][0], 'y': q['xy'][1], 'ticket': ticket}, targets, conn, 'secret_py', client_ip=client_ip, now_ms=t_ms, profanity_rules=prof_rules)
                    self.assertTrue(r['hit'])
                    ticket = r['ticket']
                    t_ms += step_ms
                self.assertTrue(r['completed'])
                sub_code, sub = nt_py.handle_action({'action': 'submit_level', 'nickname': nick, 'ticket': ticket}, targets, conn, 'secret_py', client_ip=client_ip, now_ms=t_ms, profanity_rules=prof_rules)
                return sub_code, sub, ticket, t_ms

            # Nevhodná přezdívka po levelu 1 musí být odmítnuta s 400 profanity_nickname (a nespotřebuje pokus)
            c_bad, r_bad, t1_ok, _ = play_py_level(1, 'K.u.r.v.a', 1000, step_ms=3000, client_ip='10.0.0.99')
            self.assertEqual(c_bad, 400)
            self.assertEqual(r_bad['error'], 'profanity_nickname')
            # Po opravě přezdívky z téže IP se 1. platný pokus normálně zapíše
            c_retry, r_retry = nt_py.handle_action({'action': 'submit_level', 'nickname': 'PrvniPlatny', 'ticket': t1_ok}, targets, conn, 'secret_py', client_ip='10.0.0.99', now_ms=4000, profanity_rules=prof_rules)
            self.assertEqual(c_retry, 200)
            self.assertTrue(r_retry['saved'])

            # Replay stejného ticketu ze stejné IP se nesmí zapsat podruhé
            c_rep, r_rep = nt_py.handle_action({'action': 'submit_level', 'nickname': 'ReplayPokus', 'ticket': t1_ok}, targets, conn, 'secret_py', client_ip='10.0.0.99', now_ms=4500, profanity_rules=prof_rules)
            self.assertEqual(c_rep, 200)
            self.assertFalse(r_rep['saved'])
            self.assertTrue(r_rep['alreadyPlayed'])

            # Nová hra (nový ticket) ze stejné IP 10.0.0.99 s lepším časem se do žebříčku také nesmí zapsat
            c_dup, r_dup, _, _ = play_py_level(1, 'DruhyPokus', 5000, step_ms=350, client_ip='10.0.0.99')
            self.assertEqual(c_dup, 200)
            self.assertFalse(r_dup['saved'])
            self.assertTrue(r_dup['alreadyPlayed'])
            self.assertIsNone(r_dup['rank'])

            # Platné uložení 12 různých hráčů (různé IP) -> TOP 10 na level 1 i celkově
            for i in range(12):
                s_ms = 500 + (i * 100)
                ip = f'10.0.1.{i + 1}'
                _, _, t1, t_end1 = play_py_level(1, f'Hrac_{12 - i:02d}', 10000 + i * 5000, step_ms=s_ms, client_ip=ip)
                _, sub2, t2, t_end2 = play_py_level(2, f'Hrac_{12 - i:02d}', t_end1 + 1000, step_ms=s_ms, client_ip=ip)
                self.assertTrue(sub2['saved'])
                c_fin, fin = nt_py.handle_action({'action': 'finish', 'nickname': f'Hrac_{12 - i:02d}', 'tickets': [t1, t2]}, targets, conn, 'secret_py', client_ip=ip, now_ms=t_end2 + 500, profanity_rules=prof_rules)
                self.assertEqual(c_fin, 200)
                self.assertTrue(fin['saved'])

            # Opakované finish ze stejné IP 10.0.1.1 s nově odehranou hrou nesmí přidat 2. celkové skóre
            _, _, rt1, rt_end1 = play_py_level(1, 'Hrac_12_v2', 90000, step_ms=350, client_ip='10.0.1.1')
            _, _, rt2, rt_end2 = play_py_level(2, 'Hrac_12_v2', rt_end1 + 1000, step_ms=350, client_ip='10.0.1.1')
            c_fin_dup, r_fin_dup = nt_py.handle_action({'action': 'finish', 'nickname': 'Hrac_12_v2', 'tickets': [rt1, rt2]}, targets, conn, 'secret_py', client_ip='10.0.1.1', now_ms=rt_end2 + 500, profanity_rules=prof_rules)
            self.assertEqual(c_fin_dup, 200)
            self.assertFalse(r_fin_dup['saved'])
            self.assertTrue(r_fin_dup['alreadyPlayed'])
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM najdi_to_scores WHERE nickname = 'Hrac_12_v2'").fetchone()[0], 0)

            # Sprostá přezdívka nesmí projít ani v finish
            c_fin_bad, r_fin_bad = nt_py.handle_action({'action': 'finish', 'nickname': 'p1c4', 'tickets': [t1, t2]}, targets, conn, 'secret_py', client_ip='10.0.9.9', now_ms=999999, profanity_rules=prof_rules)
            self.assertEqual(c_fin_bad, 400)
            self.assertEqual(r_fin_bad['error'], 'profanity_nickname')

            _, lb_py = nt_py.handle_action({'action': 'leaderboard'}, targets, conn, 'secret_py', profanity_rules=prof_rules)
            self.assertEqual(len(lb_py['overall']), 10)
            self.assertEqual(len(lb_py['levels']['1']), 10)
            self.assertEqual(len(lb_py['levels']['2']), 10)
            self.assertEqual(lb_py['levels']['1'][0]['nickname'], 'Hrac_12')
            self.assertEqual(lb_py['overall'][0]['nickname'], 'Hrac_12')

            # PHP backend přes CLI
            if php_bin:
                env = {
                    **os.environ,
                    'NAJDI_TO_SECRET_KEY': 'secret_php_123',
                    'NAJDI_TO_TARGETS_FILE': str(targets_path),
                    'NAJDI_TO_DB_PATH': str(tmp / 'php.sqlite'),
                }
                php_file = PLUGIN_DIR / 'server/php/najdi_to.php'

                def call_php(payload: dict) -> dict:
                    p = subprocess.run([php_bin, str(php_file)], input=json.dumps(payload), text=True, capture_output=True, env=env, check=False)
                    self.assertEqual(p.returncode, 0, p.stderr)
                    return json.loads(p.stdout)

                done_tickets = []
                for lvl_obj in targets['levels']:
                    st_php = call_php({'action': 'start', 'levelId': lvl_obj['lvl'], 'difficulty': 'medium', 'season': 'autumn'})
                    t_php = st_php['ticket']
                    for idx in st_php['order']:
                        time.sleep(0.35)
                        q = lvl_obj['questions'][idx]
                        r_php = call_php({'action': 'verify', 'x': q['xy'][0], 'y': q['xy'][1], 'ticket': t_php})
                        self.assertTrue(r_php['hit'])
                        t_php = r_php['ticket']
                    self.assertTrue(r_php['completed'])

                    bad_sub = call_php({'action': 'submit_level', 'nickname': 'Debil', 'ticket': t_php})
                    self.assertEqual(bad_sub.get('error'), 'profanity_nickname')

                    ok_sub = call_php({'action': 'submit_level', 'nickname': 'PhpHledač', 'ticket': t_php})
                    self.assertTrue(ok_sub['saved'])
                    self.assertEqual(ok_sub['rank'], 1)
                    done_tickets.append(t_php)

                fin_php = call_php({'action': 'finish', 'nickname': 'PhpHledač', 'tickets': done_tickets})
                self.assertTrue(fin_php['saved'])

                # Opakovaný pokus přes PHP ze stejné CLI identity nesmí zapsat 2. výsledek
                st_php2 = call_php({'action': 'start', 'levelId': targets['levels'][0]['lvl'], 'difficulty': 'easy', 'season': 'summer'})
                t_php2 = st_php2['ticket']
                for idx in st_php2['order']:
                    time.sleep(0.35)
                    q = targets['levels'][0]['questions'][idx]
                    r_php2 = call_php({'action': 'verify', 'x': q['xy'][0], 'y': q['xy'][1], 'ticket': t_php2})
                    t_php2 = r_php2['ticket']
                dup_php = call_php({'action': 'submit_level', 'nickname': 'PhpDruhyPokus', 'ticket': t_php2})
                self.assertFalse(dup_php['saved'])
                self.assertTrue(dup_php['alreadyPlayed'])
                fin_php2 = call_php({'action': 'finish', 'nickname': 'PhpDruhyPokus', 'tickets': done_tickets})
                self.assertFalse(fin_php2['saved'])
                self.assertTrue(fin_php2['alreadyPlayed'])

                lb_php = call_php({'action': 'leaderboard'})
                self.assertEqual(lb_php['overall'][0]['nickname'], 'PhpHledač')
                self.assertEqual(len(lb_php['overall']), 1)
                self.assertEqual(len(lb_php['levels']['1']), 1)
                self.assertEqual(lb_php['levels']['1'][0]['nickname'], 'PhpHledač')
                self.assertEqual(lb_php['levels']['2'][0]['nickname'], 'PhpHledač')


if __name__ == '__main__':
    unittest.main()
