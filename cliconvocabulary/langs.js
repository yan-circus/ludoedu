// langs.js — CliConVocabulary : langues disponibles et leur game_id Firestore
// Doit être chargé avant game-config.js / firebase-service.js / editor-firebase-service.js.
// Pour ajouter une langue : ajouter une entrée ici, puis créer les niveaux dans l'éditeur
// avec ?lang=<code>.

const VOCAB_LANGS = [
  { game_id: 2, code: 'en', label: 'Anglais',  flag: '🇬🇧' },
  { game_id: 4, code: 'de', label: 'Allemand', flag: '🇩🇪' },
];

const VOCAB_LANG = VOCAB_LANGS.find(
  l => l.code === (new URLSearchParams(location.search).get('lang') || 'en')
) || VOCAB_LANGS[0];
