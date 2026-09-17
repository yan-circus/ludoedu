// editor-firebase-service.js — CliConVocabulary editor service
// Requires: shared/firebase-core.js, shared/platform-methods.js, shared/editor-platform-methods.js
// Requires: Firebase Storage compat SDK (loaded in editor.html before this file)

const GAME_ID = VOCAB_LANG.game_id;
// Storage initialisé à la demande (pas chargé dans editor_manager.html)
const _storage = () => firebase.storage();

window.editorService = {
  ..._platformMethods,
  ..._editorPlatformMethods,
  GAME_ID,
  GAME_NAME: 'CliConVocabulary',

  // Autres langues vers lesquelles un niveau peut être copié (voir copyLevelToLang)
  copyLevelTargets: VOCAB_LANGS.filter(l => l.game_id !== GAME_ID),

  // Aliases auth
  getProvider:    () => _currentUser?.providerData[0]?.providerId || null,
  reauthPassword: (pw) => _currentUser.reauthenticateWithCredential(
    firebase.auth.EmailAuthProvider.credential(_currentUser.email, pw)
  ),
  reauthGoogle: () => _currentUser.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider()),

  // ── Families ──────────────────────────────────────────────────────────────

  createFamily: async (name) => {
    const newId = await _editorNextFamilyId();
    const now   = new Date().toISOString();
    const data  = {
      id:      newId,
      uuid:    `cv-fam-${newId}-${Date.now()}`,
      game_id: GAME_ID,
      name,
      notes:   '',
      date:    now,
      author:  _currentUser?.email || 'system',
    };
    await db.collection('level_families').doc(String(newId)).set(data);
    return { docId: String(newId), ...data };
  },

  deleteFamily: async (familyDocId) => {
    const levels = await db.collection('levels')
      .where('family_id', '==', Number(familyDocId)).get();
    const batch = db.batch();
    for (const lvl of levels.docs) {
      const words = await lvl.ref.collection('words').get();
      words.docs.forEach(w => batch.delete(w.ref));
      batch.delete(lvl.ref);
    }
    batch.delete(db.collection('level_families').doc(String(familyDocId)));
    await batch.commit();
  },

  // ── Levels ────────────────────────────────────────────────────────────────

  createLevel: async (familyId, familyUuid, name, difficulties = [], notes = '', source = 'standard', ownerUid = null, isPrivate = true) => {
    const newId = await _editorNextLevelId();
    const now   = new Date().toISOString();
    const data  = {
      id:                  newId,
      uuid:                `cv-lvl-${newId}-${Date.now()}`,
      game_id:             GAME_ID,
      family_id:           Number(familyId),
      family_uuid:         familyUuid,
      name,
      title:               name,
      difficulties:        Array.isArray(difficulties) ? difficulties : [],
      notes:               notes || '',
      source:              source,
      owner_uid:           source === 'standard' ? null : ownerUid,
      private:             source === 'perso' ? !!isPrivate : false,
      image_path:          '',
      marker_size:         16,
      arrow_size:          10,
      marker_opacity:      80,
      selected_fill:       '#ffffff',
      selected_stroke:     '#6c5ce7',
      sel_color_override:  false,
      marker_color:        '#000000',
      marker_stroke_color: '#ffffff',
      marker_stroke_width: 2,
      line_style:          'solid',
      arrow_head:          'point',
      date:                now,
      author:              _currentUser?.email || 'system',
    };
    await db.collection('levels').doc(String(newId)).set(data);
    return { docId: String(newId), ...data };
  },

  deleteLevel: async (levelDocId) => {
    const ref   = db.collection('levels').doc(String(levelDocId));
    const words = await ref.collection('words').get();
    const batch = db.batch();
    words.docs.forEach(w => batch.delete(w.ref));
    batch.delete(ref);
    await batch.commit();
  },

  // Copie un niveau vers un autre game_id (langue) : conserve image, marqueurs/tracés et le
  // français (langue pivot) ; vide le mot de langue cible (stocké sous la clé `en`, quelle que
  // soit la langue réelle) et l'audio, qui doivent être ressaisis dans la langue cible.
  copyLevelToLang: async (levelDocId, familyName, targetGameId) => {
    const srcDoc = await db.collection('levels').doc(String(levelDocId)).get();
    if (!srcDoc.exists) throw new Error('Niveau introuvable');
    const lvl = srcDoc.data();

    // Famille cible : réutilise une famille de même nom (insensible à la casse), sinon la crée
    const famSnap = await db.collection('level_families')
      .where('game_id', '==', targetGameId).get();
    let targetFam = famSnap.docs
      .map(d => ({ docId: d.id, ...d.data() }))
      .find(f => (f.name || '').trim().toLowerCase() === (familyName || '').trim().toLowerCase());
    if (!targetFam) {
      const newFamId = await _editorNextFamilyId();
      const famData = {
        id:      newFamId,
        uuid:    `cv-fam-${newFamId}-${Date.now()}`,
        game_id: targetGameId,
        name:    familyName,
        notes:   '',
        date:    new Date().toISOString(),
        author:  _currentUser?.email || 'system',
      };
      await db.collection('level_families').doc(String(newFamId)).set(famData);
      targetFam = { docId: String(newFamId), ...famData };
    }

    // Niveau cible : copie des champs indépendants de la langue, id/uuid neufs
    const newLevelId = await _editorNextLevelId();
    const newLevelData = {
      id:                  newLevelId,
      uuid:                `cv-lvl-${newLevelId}-${Date.now()}`,
      game_id:             targetGameId,
      family_id:           Number(targetFam.id),
      family_uuid:         targetFam.uuid,
      name:                lvl.name,
      title:               lvl.title,
      difficulties:        lvl.difficulties || [],
      notes:               lvl.notes || '',
      source:              lvl.source || 'standard',
      owner_uid:           lvl.owner_uid || null,
      private:             !!lvl.private,
      image_path:          lvl.image_path || '',
      marker_size:         lvl.marker_size,
      arrow_size:          lvl.arrow_size,
      marker_opacity:      lvl.marker_opacity,
      selected_fill:       lvl.selected_fill,
      selected_stroke:     lvl.selected_stroke,
      sel_color_override:  lvl.sel_color_override,
      marker_color:        lvl.marker_color,
      marker_stroke_color: lvl.marker_stroke_color,
      marker_stroke_width: lvl.marker_stroke_width,
      line_style:          lvl.line_style,
      arrow_head:          lvl.arrow_head,
      valid:               false,
      date:                new Date().toISOString(),
      author:              _currentUser?.email || 'system',
    };
    await db.collection('levels').doc(String(newLevelId)).set(newLevelData);

    // Mots : conserve position/tracé + français, vide le mot cible et l'audio
    const wordsSnap = await srcDoc.ref.collection('words').orderBy('order').get();
    if (!wordsSnap.empty) {
      const batch     = db.batch();
      const newColRef = db.collection('levels').doc(String(newLevelId)).collection('words');
      wordsSnap.docs.forEach(w => {
        const data = w.data();
        batch.set(newColRef.doc(), {
          langs:      { fr: data.langs?.fr || '' },
          point:      data.point  || null,
          arrows:     data.arrows || [],
          order:      data.order,
          audio_path: '',
          audio_name: '',
        });
      });
      await batch.commit();
    }

    return { docId: String(newLevelId), ...newLevelData };
  },

  // ── Words ─────────────────────────────────────────────────────────────────

  getWords: async (levelDocId) => {
    const snap = await db.collection('levels').doc(String(levelDocId))
      .collection('words').orderBy('order').get();
    return snap.docs.map(d => {
      const data = d.data();
      return {
        docId:      d.id,
        fr:         data.langs?.fr   || '',
        en:         data.langs?.en   || '',
        langs:      data.langs       || {},
        point:      data.point       || null,
        arrows:     data.arrows      || [],
        order:      data.order,
        audio_path: data.audio_path  || '',
        audio_name: data.audio_name  || '',
      };
    });
  },

  saveWords: async (levelDocId, words) => {
    const colRef   = db.collection('levels').doc(String(levelDocId)).collection('words');
    const existing = await colRef.get();
    const batch    = db.batch();
    existing.docs.forEach(d => batch.delete(d.ref));
    words.forEach((w, i) => {
      batch.set(colRef.doc(), {
        langs:      { ...(w.langs || {}), fr: w.fr || '', en: w.en || '' },
        point:      w.point      || null,
        arrows:     w.arrows     || [],
        order:      i,
        audio_path: w.audio_path || '',
        audio_name: w.audio_name || '',
      });
    });
    await batch.commit();
  },

  // ── Audio (Firebase Storage) ──────────────────────────────────────────────

  uploadAudio: async (levelDocId, file) => {
    const ext  = file.name.split('.').pop().toLowerCase();
    const path = `assets/audio/${levelDocId}/${Date.now()}.${ext}`;
    const ref  = _storage().ref(path);
    await ref.put(file);
    return await ref.getDownloadURL();
  },

  // ── Image (Firebase Storage) ──────────────────────────────────────────────

  uploadImage: async (levelDocId, file) => {
    const ext  = file.name.split('.').pop().toLowerCase();
    const path = `assets/lists/${levelDocId}.${ext}`;
    const ref  = _storage().ref(path);
    await ref.put(file);
    const url = await ref.getDownloadURL();
    await db.collection('levels').doc(String(levelDocId)).update({ image_path: url });
    return url;
  },

  deleteImage: async (levelDocId, imageUrl) => {
    if (!imageUrl) return;
    try { await _storage().refFromURL(imageUrl).delete(); } catch (_) {}
    await db.collection('levels').doc(String(levelDocId)).update({ image_path: '' });
  },

  // ── Seed ──────────────────────────────────────────────────────────────────

  seedVocabularyGame: async () => {
    const existing = await db.collection('games').doc('2').get();
    if (existing.exists) return;
    const batch = db.batch();
    batch.set(db.collection('games').doc('2'), {
      id: 2, name: 'CliConVocabulary',
      description: 'Jeu de vocabulaire anglais — trouvez les mots sur l\'image',
      version: '1.0',
    });
    batch.set(db.collection('game_types').doc('10'), {
      id: 10, game_id: 2, name: 'Clic on word',
      notes: 'La question affiche le mot — cliquez sur la zone correspondante',
    });
    batch.set(db.collection('game_types').doc('11'), {
      id: 11, game_id: 2, name: 'Parmi 3',
      notes: 'Une zone est affichée — choisissez le bon mot parmi 3',
    });
    batch.set(db.collection('game_types').doc('12'), {
      id: 12, game_id: 2, name: 'Type the word',
      notes: 'Une zone est affichée — tapez le mot correspondant',
    });
    batch.set(db.collection('game_types').doc('13'), {
      id: 13, game_id: 2, name: 'Listen & click',
      notes: 'L\'audio est joué — cliquez sur la zone correspondante',
    });
    await batch.commit();
  },
};
