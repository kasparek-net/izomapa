"""python tests/test_navody.py: skills pro Claude Code (.claude/skills) a Codex (.agents/skills) jsou stejné
a agenti i skills odkazují jen na existující soubory."""
import pathlib, re, unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent


class NavodyTest(unittest.TestCase):
    def test_skills_stejne_pro_claude_i_codex(self):
        claude = {p.relative_to(ROOT / '.claude/skills') for p in (ROOT / '.claude/skills').rglob('*') if p.is_file()}
        codex = {p.relative_to(ROOT / '.agents/skills') for p in (ROOT / '.agents/skills').rglob('*') if p.is_file()}
        self.assertEqual(claude, codex)
        for p in claude:
            self.assertEqual((ROOT / '.claude/skills' / p).read_bytes(), (ROOT / '.agents/skills' / p).read_bytes(), p)

    def test_hlavicka_a_odkazy(self):
        files = list((ROOT / '.claude/agents').glob('*.md')) + list((ROOT / '.claude/skills').glob('*/SKILL.md'))
        self.assertTrue(files)
        for f in files:
            text = f.read_text(encoding='utf-8')
            head = re.match(r'---\n(.*?)\n---\n', text, re.S)
            self.assertIsNotNone(head, f)
            name = re.search(r'^name: (\S+)$', head.group(1), re.M)
            self.assertEqual(name.group(1), f.stem if f.name != 'SKILL.md' else f.parent.name, f)
            self.assertRegex(head.group(1), r'(?m)^description: .{20,}', f)
            for ref in re.findall(r'`((?:navody|pamatky|priklady)/[\w.]+\.(?:md|js|json|py))`', text):
                self.assertTrue((ROOT / ref).exists(), f'{f.name}: {ref}')


if __name__ == '__main__':
    unittest.main()
