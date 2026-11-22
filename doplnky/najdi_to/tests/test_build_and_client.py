import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

PLUGIN_DIR = Path(__file__).resolve().parents[1]
ROOT = PLUGIN_DIR.parents[1]
sys.path.insert(0, str(ROOT))

import plugins  # noqa: E402


def _dummy_project_xy(lat: float, lon: float, is_world: bool = False):
    return [round(lon * 100.0, 1), round(lat * 100.0, 1)]


class TestNajdiToBuildAndClient(unittest.TestCase):
    def test_plugin_files_manifest_libs_and_ui_elements(self):
        manifest_path = PLUGIN_DIR / 'manifest.json'
        self.assertTrue(manifest_path.is_file())
        self.assertTrue((PLUGIN_DIR / 'overlay_hook.py').is_file())
        self.assertTrue((PLUGIN_DIR / 'priklady/najdi_to.json').is_file())
        self.assertTrue((PLUGIN_DIR / 'priklady/najdi_to_leaderboard.json').is_file())
        self.assertTrue((PLUGIN_DIR / 'server/php/najdi_to.php').is_file())
        self.assertTrue((PLUGIN_DIR / 'server/php/config.sample.php').is_file())

        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        self.assertEqual(manifest.get('libs'), ['profanity', 'server_client'])
        self.assertEqual(manifest.get('defaults', {}).get('mode'), 'client')
        self.assertTrue(manifest.get('defaults', {}).get('profanity_filter'))
        self.assertTrue(manifest.get('defaults', {}).get('one_attempt_only'))

        # Ověření, že web/app.html definuje layersReady před jeho použitím v zavaděči doplňků
        sys.path.insert(0, str(ROOT / 'web')); import sestav
        app_html = sestav.app()   # web/app.html + web/css + web/js
        self.assertIn('const layersReady = initLayers();', app_html)

        js = (PLUGIN_DIR / 'najdi_to.js').read_text(encoding='utf-8')
        for token in (
            'Izomapa.registerPlugin',
            "getLib?.('profanity')",
            "getLib?.('server_client')",
            'onFrame',
            'onDestroy',
            'getUiSlot',
            'getPluginLayer',
            'onMapClick',
            'setClickCapture',
            'setPinsVisible',
            'getEnvironment',
            'setEnvironment',
            'submitLevel',
            'leaderboardTabs',
            'gameNickError',
            'gameWinRank',
            'gameWinLeaderboardBtn',
            'gameFold',
            'gamePanel',
            'gameMinBtn',
            'gameLvlSelect',
            'gameDiffGroup',
            'gameSeasonGroup',
            'gameStartBtn',
            'gameTimer',
            'gameQList',
            'gameFoundDlg',
            'gameNickDlg',
            'gameWinDlg',
            'gameNextConfirmDlg',
            'gameExitDlg',
            'gameFbGuideDlg',
            'gameHelpDlg',
            'gameLeaderboardDlg',
            'gameCertCard',
            'certNick',
            'certScores',
            'certDate',
            'certId',
            'facebook.com/sharer',
        ):
            self.assertIn(token, js)

    def test_client_and_server_build_hooks_with_shared_libs(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            assets = tmp / 'assets'
            site = tmp / 'site'
            build = tmp / 'build'
            server_root = tmp / 'site_server'
            (assets / 'doplnky').mkdir(parents=True)
            shutil.copy2(PLUGIN_DIR / 'priklady/najdi_to.json', assets / 'doplnky/najdi_to.json')

            cam = {'mpp': 0.2, 'w': 4000, 'h': 2000}

            # 1) Client mode (auto-discovery z assets/doplnky/najdi_to.json)
            out_client = plugins.load_and_run_plugins(
                {'nazev': 'TestMěsto'},
                cam,
                _dummy_project_xy,
                assets_dir=assets,
                site_dir=site,
                build_dir=build,
                plugins_dir=ROOT / 'doplnky',
                libs_dir=ROOT / 'knihovny',
            )
            self.assertIn('najdi_to', out_client)
            self.assertEqual(out_client['najdi_to']['libs'], ['profanity', 'server_client'])
            self.assertEqual(
                out_client['najdi_to']['lib_scripts'],
                ['doplnky/_libs/profanity/profanity.js', 'doplnky/_libs/server_client/server_client.js'],
            )
            self.assertTrue((site / 'doplnky/_libs/profanity/profanity.js').is_file())
            self.assertTrue((site / 'doplnky/_libs/server_client/server_client.js').is_file())
            self.assertTrue((site / 'doplnky/najdi_to/najdi_to.js').is_file())
            self.assertTrue((site / 'doplnky/najdi_to/najdi_to.css').is_file())
            q0 = out_client['najdi_to']['data']['levels'][0]['questions'][0]
            self.assertIn('xy', q0)
            self.assertEqual(q0['radius_px'], 175.0)
            self.assertIn('camera', out_client['najdi_to']['data']['levels'][0])

            # 2) Server mode s private.server_data_out (nesmí proniknout do veřejného overlay.json)
            targets_path = server_root / 'server_data/najdi_to.targets.json'
            (assets / 'doplnky.json').write_text(
                json.dumps({
                    'najdi_to': {
                        'enabled': True,
                        'mode': 'server',
                        'server_url': '/api/najdi_to.php',
                        'private': {
                            'server_data_out': str(targets_path),
                        },
                    }
                }),
                encoding='utf-8',
            )
            out_server = plugins.load_and_run_plugins(
                {'nazev': 'TestMěsto'},
                cam,
                _dummy_project_xy,
                assets_dir=assets,
                site_dir=site,
                build_dir=build,
                plugins_dir=ROOT / 'doplnky',
                libs_dir=ROOT / 'knihovny',
            )
            self.assertNotIn('private', out_server['najdi_to']['config'])
            self.assertNotIn('server_data_out', out_server['najdi_to']['config'])
            pub_str = json.dumps(out_server['najdi_to']['data'], ensure_ascii=False)
            for secret_key in ('"xy"', '"lat"', '"lon"', '"targets"', '"radius"', '"radius_px"', '"answer"'):
                self.assertNotIn(secret_key, pub_str)

            self.assertTrue(targets_path.is_file())
            self.assertTrue((targets_path.parent / '.htaccess').is_file())
            self.assertTrue((site / 'api/najdi_to.php').is_file())
            targets = json.loads(targets_path.read_text(encoding='utf-8'))
            self.assertIn('xy', targets['levels'][0]['questions'][0])

    def test_najdi_to_js_with_profanity_and_server_client_libs(self):
        node_bin = shutil.which('node')
        self.assertIsNotNone(node_bin, 'Node.js je nutný pro JS test najdi_to')
        script = r"""
        import assert from 'node:assert/strict';
        import fs from 'node:fs';
        import vm from 'node:vm';

        const els = new Map();
        const makeEl = (tag = 'div') => {
          const listeners = new Map();
          const children = [];
          let _id = '';
          const el = {
            tagName: tag.toUpperCase(),
            get id() { return _id; },
            set id(v) { _id = String(v || ''); if (_id) els.set(_id, el); },
            className: '',
            hidden: false,
            disabled: false,
            value: '',
            textContent: '',
            innerHTML: '',
            dataset: {},
            style: {},
            children,
            classList: { toggle() {}, add() {}, remove() {} },
            setAttribute() {},
            appendChild(c) { children.push(c); return c; },
            append(...cs) { children.push(...cs); },
            replaceChildren() { children.length = 0; },
            remove() {},
            focus() {},
            showModal() { this.open = true; },
            close() { this.open = false; },
            querySelectorAll() { return []; },
            addEventListener(ev, fn) {
              if (!listeners.has(ev)) listeners.set(ev, []);
              listeners.get(ev).push(fn);
            },
            click() {
              for (const fn of listeners.get('click') || []) fn({ preventDefault() {}, target: el });
            }
          };
          return el;
        };

        const getEl = (id) => {
          if (!els.has(id)) {
            const e = makeEl();
            e.id = id;
          }
          return els.get(id);
        };

        const libs = {};
        const requestedLibs = [];
        const frameCbs = [];
        const clickCbs = [];
        let registeredPlugin = null;
        const storage = new Map();

        const api = {
          libs,
          registerLib(id, lib) { libs[id] = lib; },
          getLib(id) { requestedLibs.push(id); return libs[id] ?? null; },
          getPluginData: () => ({
            title: 'Najdeš to?',
            city: 'Test',
            profanity_filter: true,
            one_attempt_only: true,
            difficulties: { easy: { name: 'Lehká', time: 0, weather: 'clear' } },
            levels: [{
              lvl: 1,
              text: 'Centrum',
              questions: [{ id: 'q1', text: 'Radnice?', xy: [100, 200], radius_px: 50, answer: 'Radnice' }]
            }]
          }),
          getPluginConfig: () => ({ mode: 'client', profanity_filter: true, one_attempt_only: true }),
          registerPlugin(id, inst) { registeredPlugin = inst; inst.onInit(api); },
          getUiSlot: () => makeEl('div'),
          getPluginLayer: () => makeEl('div'),
          getEnvironment: () => ({ season: 'summer', weather: 'clear', night: 0 }),
          setEnvironment() {},
          setPinsVisible() {},
          setClickCapture() {},
          setCursor() {},
          panTo() {},
          onMapClick(fn) { clickCbs.push(fn); return () => {}; },
          onFrame(fn, opts) { frameCbs.push({ fn, opts }); return () => {}; },
        };

        const ctx = vm.createContext({
          window: { Izomapa: api },
          document: {
            getElementById: getEl,
            createElement: makeEl,
            body: makeEl('body'),
          },
          localStorage: {
            getItem: (k) => storage.get(k) ?? null,
            setItem: (k, v) => storage.set(k, String(v)),
          },
          matchMedia: () => ({ matches: false }),
          navigator: { clipboard: { writeText: async () => {} } },
          location: { href: 'http://localhost:8000/' },
          setTimeout,
          clearTimeout,
          setInterval: () => 1,
          clearInterval: () => {},
          AbortController,
          AbortSignal,
          fetch: async () => new Response('{}', { status: 200 }),
        });

        vm.runInContext(fs.readFileSync('knihovny/profanity/profanity.js', 'utf8'), ctx);
        vm.runInContext(fs.readFileSync('knihovny/server_client/server_client.js', 'utf8'), ctx);
        vm.runInContext(fs.readFileSync('doplnky/najdi_to/najdi_to.js', 'utf8'), ctx);

        assert.ok(requestedLibs.includes('profanity'), 'najdi_to musí načíst knihovnu profanity');
        assert.ok(requestedLibs.includes('server_client'), 'najdi_to musí načíst knihovnu server_client');
        assert.equal(frameCbs.length, 1, 'najdi_to musí zaregistrovat onFrame callback');
        assert.equal(frameCbs[0].opts.layer, 'world');

        // Aktivace hry, start úrovně a kliknutí na cíl
        els.get('gameFold')?.click();
        getEl('gameStartBtn').click();
        await new Promise((r) => setTimeout(r, 10));
        await clickCbs[0]({ x: 100, y: 200 });

        // Zápis sprosté přezdívky musí být zablokován knihovnou profanity
        const form = getEl('gameNickForm');
        getEl('gameNickInput').value = 'k.u.r.v.a';
        await form.onsubmit({ preventDefault() {} });
        assert.match(getEl('gameNickError').textContent, /nevhodný výraz/i);

        // Platná přezdívka projde a uloží se
        getEl('gameNickInput').value = 'Hledač';
        await form.onsubmit({ preventDefault() {} });
        const savedLb = JSON.parse(storage.get('izo-najdito-local-lb'));
        assert.equal(savedLb.levels['1'][0].nickname, 'Hledač');

        registeredPlugin.onDestroy();
        """
        proc = subprocess.run(
            [node_bin, '--input-type=module', '-e', script],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)


if __name__ == '__main__':
    unittest.main()
