import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import plugins  # noqa: E402


def _dummy_project_xy(lat: float, lon: float, is_world: bool = False):
    return [round(lon * 100.0, 1), round(lat * 100.0, 1)]


class TestPluginsCore(unittest.TestCase):
    def test_empty_plugins_zero_bloat_and_host_api(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            assets = tmp / 'assets'
            site = tmp / 'site'
            build = tmp / 'build'
            plugins_dir = tmp / 'doplnky'
            libs_dir = tmp / 'knihovny'
            assets.mkdir()
            plugins_dir.mkdir()
            libs_dir.mkdir()

            res = plugins.load_and_run_plugins(
                {'nazev': 'TestCity'},
                {'mpp': 0.2, 'w': 2000, 'h': 1000},
                _dummy_project_xy,
                assets_dir=assets,
                site_dir=site,
                build_dir=build,
                plugins_dir=plugins_dir,
                libs_dir=ROOT / 'knihovny',
            )
            self.assertEqual(res, {})
            self.assertFalse((site / 'doplnky').exists())

        self.assertFalse((ROOT / 'profanity_words.json').exists())
        self.assertFalse((ROOT / 'priklady/doplnek_vzor/server').exists())
        self.assertFalse(hasattr(plugins, 'contains_profanity'))
        self.assertFalse(hasattr(plugins, 'ensure_server_data_protection'))

        overlay_py = (ROOT / 'overlay.py').read_text(encoding='utf-8')
        self.assertIn('load_and_run_plugins', overlay_py)
        self.assertIn("**({'doplnky': _doplnky} if _doplnky else {})", overlay_py)

        sys.path.insert(0, str(ROOT / 'web')); import sestav
        app_html = sestav.app()   # web/app.html + web/css + web/js
        for method in (
            'registerLib',
            'getLib',
            'getPluginData',
            'getPluginConfig',
            'registerPlugin',
            'onMapClick',
            'onFrame',
            'setClickCapture',
            'setCursor',
            'setPinsVisible',
            'getPluginLayer',
            'getView',
            'getCam',
            'toImg',
            'imgToWorld',
            'gz',
            'latLonToWorld',
            'worldToLatLon',
            'latLonToImg',
            'panTo',
            'getEnvironment',
            'setEnvironment',
            'getUiSlot',
        ):
            self.assertIn(method, app_html)
        self.assertIn('window.Izomapa', app_html)

    def test_config_precedence_autodiscovery_and_private_keys(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            assets = tmp / 'assets'
            site = tmp / 'site'
            build = tmp / 'build'
            plugins_dir = tmp / 'doplnky'
            libs_dir = tmp / 'knihovny'
            vzor_dir = plugins_dir / 'vzor_doplnku'
            vzor_dir.mkdir(parents=True)
            assets.mkdir()
            libs_dir.mkdir()
            shutil.copytree(ROOT / 'priklady/doplnek_vzor', vzor_dir, dirs_exist_ok=True)
            (assets / 'doplnky').mkdir(parents=True)
            shutil.copy2(vzor_dir / 'vzor_doplnku.sample.json', assets / 'doplnky/vzor_doplnku.json')

            # 1) Auto-discovery bez assets/doplnky.json (podle assets/doplnky/<id>.json)
            active = plugins.discover_plugin_configs({'nazev': 'Test'}, assets, plugins_dir)
            self.assertIn('vzor_doplnku', active)

            # 2) Vypnutí v mesto.json zabrání auto-discovery
            active_off = plugins.discover_plugin_configs(
                {'nazev': 'Test', 'doplnky': {'vzor_doplnku': {'enabled': False}}},
                assets,
                plugins_dir,
            )
            self.assertNotIn('vzor_doplnku', active_off)

            # 3) assets/doplnky.json přepisuje mesto.json a sekce private se nepropisuje do overlay.json
            (assets / 'doplnky.json').write_text(
                json.dumps({
                    'vzor_doplnku': {
                        'enabled': True,
                        'public_opt': 'ok',
                        'private': {'secret_token': 'tajne', 'api_key': 'tajne2'},
                    }
                }),
                encoding='utf-8',
            )
            res = plugins.load_and_run_plugins(
                {'nazev': 'Test', 'doplnky': {'vzor_doplnku': {'enabled': False}}},
                {'mpp': 0.2, 'w': 2000, 'h': 1000},
                _dummy_project_xy,
                assets_dir=assets,
                site_dir=site,
                build_dir=build,
                plugins_dir=plugins_dir,
                libs_dir=ROOT / 'knihovny',
            )
            pub_cfg = res['vzor_doplnku']['config']
            self.assertEqual(pub_cfg['public_opt'], 'ok')
            self.assertNotIn('private', pub_cfg)

    def test_vzor_client_plugin_with_shared_libs_and_deduplication(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            assets = tmp / 'assets'
            site = tmp / 'site'
            build = tmp / 'build'
            plugins_dir = tmp / 'doplnky'
            vzor_dir = plugins_dir / 'vzor_doplnku'
            other_dir = plugins_dir / 'druhy_doplnek'
            assets.mkdir()
            vzor_dir.mkdir(parents=True)
            other_dir.mkdir(parents=True)
            shutil.copytree(ROOT / 'priklady/doplnek_vzor', vzor_dir, dirs_exist_ok=True)
            (assets / 'doplnky').mkdir(parents=True)
            shutil.copy2(vzor_dir / 'vzor_doplnku.sample.json', assets / 'doplnky/vzor_doplnku.json')

            # Druhý doplněk používá stejné knihovny i bez vlastního hooku
            (other_dir / 'manifest.json').write_text(
                json.dumps({
                    'id': 'druhy_doplnek',
                    'libs': ['profanity', 'server_client'],
                    'scripts': ['druhy.js'],
                    'styles': [],
                }),
                encoding='utf-8',
            )
            (other_dir / 'druhy.js').write_text('window.Izomapa?.registerPlugin("druhy_doplnek", {});', encoding='utf-8')
            (assets / 'doplnky.json').write_text(
                json.dumps({'vzor_doplnku': {'enabled': True}, 'druhy_doplnek': {'enabled': True}}),
                encoding='utf-8',
            )

            res = plugins.load_and_run_plugins(
                {'nazev': 'Test'},
                {'mpp': 0.2, 'w': 4000, 'h': 2000},
                _dummy_project_xy,
                assets_dir=assets,
                site_dir=site,
                build_dir=build,
                plugins_dir=plugins_dir,
                libs_dir=ROOT / 'knihovny',
            )

            self.assertIn('vzor_doplnku', res)
            self.assertIn('druhy_doplnek', res)
            self.assertEqual(res['vzor_doplnku']['data']['points'][0]['xy'], [1505.9, 5077.0])
            self.assertEqual(
                res['vzor_doplnku']['lib_scripts'],
                ['doplnky/_libs/profanity/profanity.js', 'doplnky/_libs/server_client/server_client.js'],
            )
            self.assertEqual(
                res['druhy_doplnek']['lib_scripts'],
                ['doplnky/_libs/profanity/profanity.js', 'doplnky/_libs/server_client/server_client.js'],
            )
            self.assertTrue((site / 'doplnky/_libs/profanity/profanity.js').is_file())
            self.assertTrue((site / 'doplnky/_libs/server_client/server_client.js').is_file())
            self.assertTrue((site / 'doplnky/vzor_doplnku/vzor.js').is_file())
            self.assertTrue((site / 'doplnky/vzor_doplnku/vzor.css').is_file())

    def test_unused_libs_are_not_copied_when_plugin_has_no_libs_or_is_disabled(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            assets = tmp / 'assets'
            site = tmp / 'site'
            build = tmp / 'build'
            plugins_dir = tmp / 'doplnky'
            simple_dir = plugins_dir / 'prosty'
            off_dir = plugins_dir / 'vypnuty'
            assets.mkdir()
            simple_dir.mkdir(parents=True)
            off_dir.mkdir(parents=True)

            (simple_dir / 'manifest.json').write_text(
                json.dumps({'id': 'prosty', 'scripts': ['prosty.js'], 'styles': []}),
                encoding='utf-8',
            )
            (simple_dir / 'prosty.js').write_text('/* noop */', encoding='utf-8')
            (off_dir / 'manifest.json').write_text(
                json.dumps({'id': 'vypnuty', 'libs': ['profanity'], 'scripts': ['vypnuty.js'], 'styles': []}),
                encoding='utf-8',
            )
            (off_dir / 'overlay_hook.py').write_text('def build_overlay(ctx):\n    return False\n', encoding='utf-8')
            (off_dir / 'vypnuty.js').write_text('/* noop */', encoding='utf-8')
            (assets / 'doplnky.json').write_text(
                json.dumps({'prosty': {'enabled': True}, 'vypnuty': {'enabled': True}}),
                encoding='utf-8',
            )

            res = plugins.load_and_run_plugins(
                {'nazev': 'Test'},
                {'mpp': 0.2, 'w': 2000, 'h': 1000},
                _dummy_project_xy,
                assets_dir=assets,
                site_dir=site,
                build_dir=build,
                plugins_dir=plugins_dir,
                libs_dir=ROOT / 'knihovny',
            )
            self.assertIn('prosty', res)
            self.assertNotIn('vypnuty', res)
            self.assertNotIn('lib_scripts', res['prosty'])
            self.assertFalse((site / 'doplnky/_libs').exists())

    def test_node_js_plugin_libs_and_loader_suite(self):
        node_bin = shutil.which('node')
        self.assertIsNotNone(node_bin, 'Node.js je nutný pro JS testy doplňků')
        proc = subprocess.run(
            [node_bin, str(ROOT / 'tests/test-plugins.mjs')],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)


if __name__ == '__main__':
    unittest.main()
