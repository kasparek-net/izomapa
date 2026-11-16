/**
 * Klientská knihovna pro kontrolu nevhodných výrazů v textu (např. přezdívky, poznámky).
 *
 * POZNÁMKA: Tato validace běží pouze v prohlížeči a slouží pro rychlou zpětnou vazbu
 * uživateli (UX). Pro plnohodnotné ošetření je nutné obdobnou knihovnu začlenit i do
 * případného server-side kódu doplňku, protože klientský JavaScript lze obejít.
 */
(() => {
  const Izomapa = window.Izomapa;
  if (!Izomapa || Izomapa.getLib('profanity')) return;

  const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

  const EXACT = [
    'vul', 'vole', 'blb', 'blbc', 'blbce', 'blbec', 'blbci', 'blbco', 'blbecek',
    'pica', 'pico', 'picu', 'pice', 'picus', 'picov', 'picovat',
    'kunda', 'kundy', 'kundu', 'kundo', 'kundic', 'kundicka',
    'srac', 'debil', 'debilni', 'debile', 'kreten', 'kretene', 'idiot', 'idiote',
    'hajzl', 'hajzle', 'chuj', 'chuje', 'buzna', 'buzny', 'krypl', 'magor',
    'nazi', 'neonazi', 'hitler', 'heil',
    'ass', 'cock', 'cocks', 'dick', 'dicks', 'cunt', 'slut', 'whore', 'twat', 'wank', 'wanker', 'prick',
  ];

  const PREFIXES = [
    'kurv', 'zkurv', 'vykurv', 'kurev', 'curak', 'curac', 'kokot',
    'zmrd', 'mrda', 'mrdam', 'mrdat', 'mrdal', 'mrdk', 'mrdn', 'omrd', 'vymrd', 'domrd',
    'jebat', 'jebu', 'jebe', 'jebal', 'jebn', 'zjeb', 'vyjeb', 'ojeb', 'pojeb',
    'prdel', 'srack', 'srat', 'posr', 'nasr', 'vysr', 'zasr',
    'sukat', 'sukam', 'sukas', 'vysuk', 'zasuk', 'osuk', 'devk', 'stetk', 'buzer', 'teplous',
    'fuck', 'shit', 'bitch', 'asshole', 'dickhead', 'motherfuck', 'bullshit', 'retard', 'nigger', 'faggot',
  ];

  const COMPACT = ['kurv', 'curak', 'kokot', 'zmrd', 'prdel', 'srack', 'buzerant', 'hitler', 'fuck', 'nigger', 'faggot'];

  function normalize(text, leet = false) {
    let out = String(text ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (leet) out = out.replace(/[013457@$!]/g, (ch) => LEET[ch] || ch);
    return out;
  }

  const collapse = (tok) => tok.replace(/(.)\1+/g, '$1');

  function contains(text, options = {}) {
    if (options.enabled === false) return false;
    const raw = String(text ?? '').trim();
    if (!raw) return false;

    const allow = new Set((options.allowWords || []).map((w) => normalize(w).trim()).filter(Boolean));
    const exact = new Set(EXACT.filter((w) => !allow.has(w)));
    const prefixes = PREFIXES.filter((w) => !allow.has(w));
    const compactPhrases = COMPACT.filter((w) => !allow.has(w));

    for (const w of options.extraWords || []) {
      const nw = normalize(w).trim();
      if (!nw || allow.has(nw)) continue;
      exact.add(nw);
      if (nw.length >= 4) prefixes.push(nw);
    }

    for (const leet of [false, true]) {
      const norm = normalize(raw, leet);
      const merged = norm.replace(/(?<![a-z0-9])(?:[a-z0-9][\s._*+-]+){2,}[a-z0-9](?![a-z0-9])/g, (m) => m.replace(/[^a-z0-9]/g, ''));
      for (const tok of merged.match(/[a-z0-9]+/g) || []) {
        if (allow.has(tok)) continue;
        for (const cand of [tok, collapse(tok)]) {
          if (allow.has(cand)) continue;
          if (exact.has(cand) || prefixes.some((p) => cand.startsWith(p))) return true;
        }
      }
      const compact = norm.replace(/[^a-z0-9]+/g, '');
      for (const cand of [compact, collapse(compact)]) {
        if (compactPhrases.some((phrase) => cand.includes(phrase))) return true;
      }
    }
    return false;
  }

  const isValid = (text, options = {}) => !contains(text, options);
  const censor = (text, replacement = '***', options = {}) => (contains(text, options) ? replacement : String(text ?? ''));

  Izomapa.registerLib('profanity', { normalize, contains, isValid, censor });
})();
