# tralala.io model pipeline (placeholder)

Du kannst später echte 3D-Modelle (GLB/GLTF) integrieren, ohne die Spiellogik komplett neu zu bauen.

## Geplanter Weg
1. Lege Uploads in `client/assets/models/` ab.
2. Ergänze in `client/src/main.js` im Abschnitt `SKINS` pro Skin ein optionales Feld `modelUrl`.
3. Ersetze den Player-Cube in `createAvatar` durch einen `GLTFLoader`-Import.
4. Fallback bleibt der aktuelle stylische Cube, falls Model fehlt.

## Warum so?
- Schnell prototypen mit primitives.
- Später professionell austauschbar mit echten Figuren/Skins.
