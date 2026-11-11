import unittest
import math


class TestStada(unittest.TestCase):
    def test_stada_parsing(self):
        stada_input = [
            {"typ": "kravy", "lat": 50.8945, "lon": 15.0435, "pocet": 12, "radius": 35},
            {"typ": "kone", "lat": 50.8915, "lon": 15.0335, "pocet": 6, "radius": 30},
            {"typ": "srnky", "lat": 50.8985, "lon": 15.0410, "pocet": 5, "radius": 25},
        ]

        parsed = []
        for h in stada_input:
            typ_raw = str(h.get('typ', h.get('type', 'cow'))).lower()
            typ = 'horse' if any(k in typ_raw for k in ('kun', 'kone', 'horse')) else 'deer' if any(k in typ_raw for k in ('srn', 'deer')) else 'cow'
            parsed.append({
                'typ': typ,
                'n': int(h.get('pocet', h.get('count', 8))),
                'r': float(h.get('radius', 30.0)),
                'mladata': bool(h.get('mladata', True))
            })

        self.assertEqual(len(parsed), 3)
        self.assertEqual(parsed[0]['typ'], 'cow')
        self.assertEqual(parsed[0]['n'], 12)
        self.assertEqual(parsed[0]['r'], 35.0)

        self.assertEqual(parsed[1]['typ'], 'horse')
        self.assertEqual(parsed[1]['n'], 6)

        self.assertEqual(parsed[2]['typ'], 'deer')
        self.assertEqual(parsed[2]['n'], 5)

    def test_empty_stada_backwards_compatibility(self):
        empty_cfg = {}
        herds_out = empty_cfg.get('stada', empty_cfg.get('herds', []))
        self.assertEqual(herds_out, [])


if __name__ == '__main__':
    unittest.main()
