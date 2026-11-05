"""python tests/test_mhd_cisjr.py"""
import datetime, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'nastroje'))
from mhd_cisjr import active_versions, clip_bits, inside_runs, line_label, shortest, stop_key, stop_label, to_calendar

D = datetime.date
assert stop_key('Kopřivnice,,Čs.armády') == stop_key('Kopřivnice, Čs. armády')
assert stop_key('Kopřivnice,Lubina,rozc.') == stop_key('Kopřivnice, Lubina, rozcestí')
assert stop_label('Kopřivnice,,Čs.armády') == 'Kopřivnice, Čs.armády'
assert line_label('883653') == '653' and line_label('882697') == '697' and line_label('910142') == '910142'
assert inside_runs([0, 1, 1, 0, 1, 0, 1, 1, 1]) == [[1, 2], [6, 7, 8]]

old, new, detour = (D(2026, 6, 14), False, 'a'), (D(2026, 8, 30), False, 'b'), (D(2026, 8, 30), True, 'c')
assert active_versions([new, old]) == [(old, D(2026, 8, 30)), (new, None)]
assert active_versions([old, new, detour]) == [(old, D(2026, 8, 30)), (detour, None)]
assert clip_bits(D(2026, 1, 1), '1111', D(2026, 1, 2), D(2026, 1, 4)) == '0110'

# Mon 2.11.2026 to Sun 22.11.2026, weekdays only, Tue 17.11. off, Sat 7.11. extra
bits = ''.join('1' if (D(2026, 11, 2) + datetime.timedelta(days=i)).weekday() < 5 else '0' for i in range(19))
bits = bits[:15] + '0' + bits[16:]
bits = bits[:5] + '1' + bits[6:]
week, a, b, add, rem = to_calendar(D(2026, 11, 2), bits)
assert week == [1, 1, 1, 1, 1, 0, 0] and (a, b) == (20261102, 20261120)
assert add == [20261107] and rem == [20261117]
assert to_calendar(D(2026, 11, 2), '000') is None

adj = {'a': [('b', 1, 0), ('c', 5, 1)], 'b': [('c', 1, 2)], 'c': []}
assert shortest(adj, 'a', 'c') == (2, ['a', 'b', 'c']) and shortest(adj, 'c', 'a') is None
print('ok')
