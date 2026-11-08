// Vlastní 3D modely dominant (b.lm) a doplňků/rekvizit (scene.props) pro konkrétní město.
// Zkopíruj tento soubor do assets/custom_models.js a uprav podle potřeby.
// Načítá se automaticky z render.html, takže hlavní kód renderu zůstává čistý.

export const landmarks = {
  // Ukázka vlastního modelu dominanty napárované přes dominanty.json: "spec": {"lm": "moje_rozhledna"}
  // b: objekt budovy ze scene.json
  // context: { X, W, R, frameAt, ring, pushBox, pushQuad, pushTri, GOLDC, C255, tv }
  moje_rozhledna(b, { X, frameAt, ring, pushBox, GOLDC }) {
    if (!b.tw || !b.tw.length) return false;
    const t = b.tw[0], f = frameAt(t.x, t.y, 0, 0), g0 = b.g;
    const wood = [0.64, 0.44, 0.25], stone = [0.58, 0.56, 0.52];

    // Kamenný sokl
    ring(X, f, 2.0, 2.0, t.b, g0 + 2.0, 8, stone, [0, 1, 1, 0]);
    // Dřevěná věž
    pushBox(X, f, -1.2, 1.2, -1.2, 1.2, g0 + 2.0, g0 + 15.0, wood, [0, 1, 1, 0]);

    return true; // true = model byl vykreslen, standardní věže se přeskočí
  },
};

// Volitelné vlastní doplňky / rekvizity (např. zvířata na pastvinách, sochy, lavičky)
export function buildProps(P, { make, inst, F, id, pushBox, pushQuad, pushTri }) {
  // P: buffer pro geometrii rekvizit
  // Příklad vytvoření geometrie a instancování z dat v scene.props
}
