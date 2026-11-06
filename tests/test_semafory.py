"""python tests/test_semafory.py: semafory jedné křižovatky mají společnou skupinu."""
import sys
sys.path.insert(0, '.'); sys.path.insert(0, 'nastroje')
import semafory as s

g = s.skupiny([(0, 0), (30, 0), (60, 0), (500, 0)])
assert g[0] == g[1] == g[2], 'řetěz do 40 m je jedna křižovatka'
assert g[3] != g[0]
assert s.skupiny([]) == []
print('ok')
