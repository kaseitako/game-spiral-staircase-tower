import './style.css';
import { TowerGame } from './game.ts';
import { ACCESSORY_NAMES, ITEM_NAMES, accessoryColor, accessoryFind, accessoryKind, canPlace, itemKind, postcard, roomFind, roomNumber, sourceRoom } from './model.ts';
import type { Accessory, AccessoryKind, ItemKind, Keepsake, LookMode, Preferences } from './model.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
const towerMark = '<svg viewBox="0 0 32 40" aria-hidden="true"><path d="M12 2v36M20 2v36M5 12l22-7M5 22l22-7M5 32l22-7"/></svg>';
app.innerHTML = `
  <main id="view" aria-label="白の塔"></main>
  <div class="vignette" aria-hidden="true"></div>
  <div id="hud" class="hud" hidden>
    <header class="topbar">
      <div class="wordmark">${towerMark}<span>白の塔<small>THE STILL TOWER</small></span></div>
      <nav aria-label="散歩の設定">
        <button id="inventory-toggle" class="quiet-button" aria-expanded="false" aria-controls="belongings">持ち物 <span id="inventory-count">0</span> <kbd>Q</kbd></button>
        <button id="fast" class="quiet-button" aria-pressed="false">早歩き <kbd>F</kbd></button>
        <button id="help" class="quiet-button" aria-expanded="false" aria-controls="guide">操作 <kbd>H</kbd></button>
        <button id="pause" class="quiet-button">ひと休み <span class="pause-icon" aria-hidden="true">Ⅱ</span></button>
      </nav>
    </header>
    <aside id="guide" class="guide" hidden aria-label="操作ガイド">
      <div class="guide-heading">歩き方<button id="close-guide" aria-label="操作ガイドを閉じる">×</button></div>
      <dl><dt>階段を上る・下る</dt><dd><kbd>W</kbd> <kbd>S</kbd> または <kbd>↑</kbd> <kbd>↓</kbd></dd>
      <dt>部屋の中を歩く</dt><dd><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> / 矢印キー</dd>
      <dt>入る・座る・立つ・出る</dt><dd>近くで <kbd>E</kbd></dd>
      <dt>拾う・置く・お茶・着替え</dt><dd><kbd>Q</kbd> で持ち物をひらく<br><kbd>W</kbd> <kbd>S</kbd> で選ぶ・<kbd>E</kbd> で決定</dd>
      <dt>早歩きに切り替える</dt><dd><kbd>F</kbd> または画面上の「早歩き」</dd>
      <dt>下・上・遠くを見る</dt><dd><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> ／ 戻る <kbd>Esc</kbd></dd>
      <dt>今いる部屋を自分の家にする</dt><dd>室内で <kbd>T</kbd>。家はひとつだけです。</dd>
      <dt>飛び降りて家へ帰る</dt><dd>階段で <kbd>R</kbd>。先に家を決めてください。</dd>
      <dt>一時停止</dt><dd><kbd>Esc</kbd></dd></dl>
      <p>眺める間は立ち止まります。<br>同じボタンか Esc、歩き出すと元の視点へ。<br>歩いているだけでは階段から落ちません。</p>
      <p>飛び降りると、しばらく白い靄の中を落ちて家に戻ります。家と持ち物を引き継ぎ、ほかの部屋は入れ替わります。家以外に置いた物には戻れません。訪問数は新しい塔で数え直します。</p>
    </aside>
    <button id="room-discovery" class="room-discovery" hidden><span id="discovery-text"></span><small>部屋のものを見る <kbd>Q</kbd></small></button>
    <aside id="belongings" class="belongings" aria-label="部屋のものと持ち物" hidden>
      <div class="belongings-heading"><div><span class="eyebrow">LITTLE THINGS</span><p>旅の持ち物</p></div><button id="close-belongings" aria-label="持ち物を閉じる">×</button></div>
      <div id="belongings-content"></div>
      <p class="belongings-foot"><kbd>W</kbd> <kbd>S</kbd> 選ぶ · <kbd>E</kbd> 決定 · <kbd>Q</kbd> 閉じる<br>気に入った部屋に、ひとつ置いていこう。</p>
    </aside>
    <div class="look-panel" role="group" aria-label="景色を眺める">
      <span class="look-caption">少し、立ち止まって。</span>
      <div class="look-buttons">
        <button data-look="down" aria-pressed="false"><span>下を覗く</span><kbd>1</kbd></button>
        <button data-look="up" aria-pressed="false"><span>上を見上げる</span><kbd>2</kbd></button>
        <button data-look="far" aria-pressed="false"><span>遠くを眺める</span><kbd>3</kbd></button>
      </div>
      <button id="look-back" class="look-back" hidden>いつもの視点に戻る <kbd>Esc</kbd></button>
    </div>
    <aside id="journey-panel" class="journey-panel" aria-label="自分の家と帰宅">
      <p id="home-status">自分の家は、まだありません。</p>
      <button id="mark-home" hidden><span id="home-button-label">ここを自分の家にする</span><kbd>T</kbd></button>
      <button id="jump" disabled>飛び降りる <kbd>R</kbd></button>
      <p id="home-note">部屋に入り、家を決めてください。</p>
    </aside>
    <p id="notice" class="notice" role="status" hidden></p>
    <footer class="bottom-bar">
      <div class="place"><span id="place-tag">THE STAIRWAY</span><p id="place-label">白い靄の中</p><span id="visited-count" class="visited-count" aria-live="polite">訪れた部屋 0 室</span></div>
      <div class="interaction"><button id="interact" class="action-button" hidden><kbd>E</kbd><span id="action-label"></span><span aria-hidden="true">↗</span></button><p id="hint">W / S で、上へ、下へ。</p></div>
      <span class="ambient-note" id="ambient-note">行き先は、ありません。</span>
    </footer>
    <div class="touch-pad" aria-label="移動ボタン">
      <button data-move="up" aria-label="上る・前へ">↑</button>
      <div class="touch-sides" id="touch-sides" hidden><button data-move="left" aria-label="左へ">←</button><button data-move="right" aria-label="右へ">→</button></div>
      <button data-move="down" aria-label="下る・後ろへ">↓</button>
    </div>
  </div>
  <div id="whiteout" class="whiteout" aria-hidden="true"></div>
  <section id="menu" class="menu" role="dialog" aria-modal="true" aria-labelledby="menu-title">
    <div class="menu-content">
      <div class="eyebrow">A SMALL, QUIET WALK</div>
      <h1 id="menu-title">白の塔</h1>
      <div class="title-rule"></div>
      <p id="menu-description" class="description">白い靄の中に、階段が続いている。<br>上っても、下っても。<br>気が向いたら、部屋でひと休み。</p>
      <button id="start" class="start-button" disabled><span>準備しています</span><span aria-hidden="true">→</span></button>
      <div id="preferences" class="preferences" hidden>
        <label>歩く速さ<select id="pace"><option value="slow">ゆっくり</option><option value="normal">ふつう</option><option value="fast">早歩き</option></select></label>
        <label>描画品質<select id="quality"><option value="standard">標準</option><option value="light">軽量</option></select></label>
      </div>
      <p id="menu-controls" class="menu-controls"><kbd>W</kbd> <kbd>S</kbd> で歩く <span>·</span> <kbd>E</kbd> で入る</p>
      <p class="save-note" id="save-note">位置は、このブラウザに保存されます。</p>
    </div>
    <div class="menu-foot"><span>THE STILL TOWER</span><span>音のない、小さな散歩。</span></div>
  </section>
  <dialog id="postcard-dialog" class="postcard-dialog" aria-labelledby="postcard-title">
    <button id="close-postcard" class="postcard-close" aria-label="絵葉書を閉じる">×</button>
    <div id="postcard-art" class="postcard-art" aria-hidden="true"><span class="postcard-sun"></span><span class="postcard-hill"></span><span class="postcard-tower"></span></div>
    <div class="postcard-letter"><span id="postcard-origin" class="eyebrow"></span><h2 id="postcard-title"></h2><p id="postcard-text"></p><span class="postcard-signoff">差出人のない、小さな便り。</span></div>
    <button id="put-away-postcard" class="postcard-away">絵葉書をしまう <kbd>Esc</kbd></button>
  </dialog>
  <div id="error" class="error-panel" hidden role="alert"></div>
`;

const element = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const menu = element('menu');
const hud = element('hud');
const start = element<HTMLButtonElement>('start');
const guide = element('guide');
const interaction = element<HTMLButtonElement>('interact');
const belongings = element('belongings');
const postcardDialog = element<HTMLDialogElement>('postcard-dialog');
const lookButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-look]')];
const text = (id: string, value: string): void => { const node = element(id); if (node.textContent !== value) node.textContent = value; };
let game: TowerGame;
let hasStarted = false;
let belongingsSignature = '';
let shownPostcard: number | null = null;

const itemIcon = (kind: ItemKind | AccessoryKind): string => {
  const paths = {
    cup: '<path d="M6 8h15v11a5 5 0 0 1-5 5h-5a5 5 0 0 1-5-5Z"/><path d="M21 10h3a4 4 0 0 1 0 8h-3M6 27h16"/>',
    lantern: '<path d="M8 10h16v15H8ZM7 27h18M7 8h18M12 8V5a4 4 0 0 1 8 0v3M12 11v13M20 11v13"/><path d="M16 15v6"/>',
    postcard: '<path d="M4 7h24v19H4Z"/><path d="m7 21 6-7 4 4 3-3 5 6M9 11h2"/>',
    hat: '<path d="m9 18 2-10h10l2 10M9 16h14"/><ellipse cx="16" cy="20" rx="13" ry="5"/>',
    flower: '<path d="M16 29V14m0 10-6-4m6 1 6-4"/><circle cx="16" cy="10" r="3"/><path d="M13 7C8-2 2 9 10 11c-7 6 3 12 6 4 5 7 13-1 6-5 6-6-5-11-6-4"/>',
  };
  return `<svg viewBox="0 0 32 32" aria-hidden="true">${paths[kind]}</svg>`;
};

function toggleBelongings(): void {
  if (!game?.running || game.falling || game.reading !== null) return;
  belongings.hidden = !belongings.hidden;
  element('inventory-toggle').setAttribute('aria-expanded', String(!belongings.hidden));
  if (!belongings.hidden) {
    guide.hidden = true;
    element('help').setAttribute('aria-expanded', 'false');
    game.input.clear();
    belongings.querySelector<HTMLButtonElement>('[data-item-action]:not(:disabled)')?.focus({ preventScroll: true });
  } else if (belongings.contains(document.activeElement)) {
    (document.activeElement as HTMLElement).blur();
  }
}

function renderBelongings(keepsakes: Keepsake[], accessories: Accessory[], busy: boolean): void {
  const room = game.state.room;
  const indoors = game.state.place !== 'stairs';
  const signature = JSON.stringify([room, indoors, busy, game.tea, game.realm, keepsakes, accessories]);
  if (signature === belongingsSignature) return;
  belongingsSignature = signature;
  const carried = keepsakes.filter((item) => item.room === null);
  const button = (label: string, action: string, source?: number, disabled = false, title = '') =>
    `<button data-item-action="${action}"${source === undefined ? '' : ` data-source="${source}"`}${busy || disabled ? ' disabled' : ''}${title ? ` title="${title}"` : ''}>${label}</button>`;
  const row = (item: Keepsake, actions: string, detail: string) => `<div class="keepsake" data-item-source="${item.source}"><div class="keepsake-icon">${itemIcon(itemKind(item.source))}</div><div class="keepsake-description"><strong>${ITEM_NAMES[itemKind(item.source)]}</strong><small>${detail}</small><div class="keepsake-actions">${actions}</div></div></div>`;
  const accessoryRow = (item: Accessory, actions: string, detail: string) => `<div class="keepsake accessory${item.worn ? ' is-worn' : ''}" data-accessory-source="${item.source}"><div class="keepsake-icon" style="--accessory-color:${accessoryColor(item.source)}">${itemIcon(accessoryKind(item.source))}</div><div class="keepsake-description"><strong>${ACCESSORY_NAMES[accessoryKind(item.source)]}${item.worn ? ' <span class="worn-label">着用中</span>' : ''}</strong><small>${detail}</small><div class="keepsake-actions">${actions}</div></div></div>`;
  let markup = '';
  if (indoors) {
    markup += `<section class="room-things"><h2>この部屋 <span>ROOM ${roomNumber(room)}</span></h2>`;
    const found = roomFind(room, keepsakes, game.realm);
    if (found) {
      markup += row(found, button('拾う', 'take', found.source) + (itemKind(found.source) === 'postcard' ? button('読む', 'read', found.source) : ''), '小さな台に置かれている');
    }
    const accessory = accessoryFind(room, accessories, game.realm);
    if (accessory) markup += accessoryRow(accessory, button('拾う', 'take-accessory', accessory.source), '小さな腰掛けに置かれている');
    const placed = keepsakes.filter((item) => item.room === room);
    for (const item of placed) {
      const kind = itemKind(item.source);
      let actions = kind === 'lantern' ? button(item.lit ? '灯りを消す' : '灯りをつける', 'light', item.source) : '';
      if (kind === 'postcard') actions += button('読む', 'read', item.source);
      markup += row(item, actions + button('持ち物に戻す', 'take', item.source), kind === 'postcard' ? '壁に飾ってある' : item.lit ? '机の上で灯っている' : '机に置いてある');
    }
    if (!found && !accessory && !placed.length) markup += '<p class="empty-belongings">机と壁に、持ち物を飾れます。</p>';
    const hasCup = keepsakes.some((item) => itemKind(item.source) === 'cup' && (item.room === null || item.room === room));
    markup += `<div class="tea-action">${button(game.tea ? '飲み終える' : 'お茶を淹れて休む', game.tea ? 'finish-tea' : 'tea', undefined, !hasCup)}<small>${game.tea ? '湯気を眺めながら、もう少し。' : hasCup ? 'カップと、部屋のポットでひと息。' : 'カップを拾うと、お茶を淹れられます。'}</small></div></section>`;
  }
  if (accessories.length) {
    markup += '<section><h2>身につけるもの <span>帽子と花は一緒に</span></h2>';
    for (const item of accessories) {
      const label = item.worn ? 'はずす' : accessoryKind(item.source) === 'hat' ? 'かぶる' : '髪に飾る';
      markup += accessoryRow(item, button(label, 'wear', item.source), `ROOM ${roomNumber(sourceRoom(item.source))} で見つけた`);
    }
    markup += '</section>';
  }
  markup += `<section><h2>持ち歩いているもの <span>${carried.length} 個</span></h2>`;
  if (!carried.length) markup += '<p class="empty-belongings">部屋で見つけたものを、少しずつ。</p>';
  for (const item of carried) {
    const kind = itemKind(item.source);
    let actions = kind === 'postcard' ? button('読む', 'read', item.source) : '';
    if (indoors) actions += button(kind === 'postcard' ? '壁に飾る' : '机に置く', 'place', item.source, !canPlace(item, room, keepsakes), !canPlace(item, room, keepsakes) ? '同じ種類のものを先に持ち物へ戻してください' : '');
    markup += row(item, actions, `ROOM ${roomNumber(sourceRoom(item.source))} で見つけた`);
  }
  if (!indoors && carried.length) markup += '<p class="empty-belongings">部屋に入ると、置いたり使ったりできます。</p>';
  markup += '</section>';
  const content = element('belongings-content');
  const previousButtons = [...content.querySelectorAll<HTMLButtonElement>('[data-item-action]:not(:disabled)')];
  const focused = document.activeElement as HTMLElement | null;
  const focusedIndex = previousButtons.indexOf(focused as HTMLButtonElement);
  const focusedAction = focused?.dataset.itemAction;
  const focusedSource = focused?.dataset.source;
  content.innerHTML = markup;
  if (!belongings.hidden && focusedIndex >= 0) {
    const buttons = [...content.querySelectorAll<HTMLButtonElement>('[data-item-action]:not(:disabled)')];
    const next = buttons.find((button) => button.dataset.itemAction === focusedAction && button.dataset.source === focusedSource)
      ?? buttons[Math.min(focusedIndex, buttons.length - 1)];
    next?.focus({ preventScroll: true });
  }
}

function showMenu(): void {
  if (!game || !hasStarted) return;
  game.pause();
  menu.hidden = false;
  hud.hidden = true;
  guide.hidden = true;
  belongings.hidden = true;
  element('inventory-toggle').setAttribute('aria-expanded', 'false');
  element('help').setAttribute('aria-expanded', 'false');
  element('menu-title').textContent = 'ひと休み';
  element('menu-description').innerHTML = '急がなくて、大丈夫。<br>塔はここで、待っています。';
  start.querySelector('span')!.textContent = '散歩をつづける';
  element('preferences').hidden = false;
  element('menu-controls').hidden = true;
  element<HTMLSelectElement>('pace').value = game.preferences.pace;
  element<HTMLSelectElement>('quality').value = game.preferences.quality;
  start.focus();
}

function startWalk(): void {
  if (!game) return;
  menu.hidden = true;
  hud.hidden = false;
  hasStarted = true;
  start.blur();
  game.start();
}

function toggleGuide(): void {
  if (!game?.running || game.falling) return;
  guide.hidden = !guide.hidden;
  if (!guide.hidden) { belongings.hidden = true; element('inventory-toggle').setAttribute('aria-expanded', 'false'); }
  element('help').setAttribute('aria-expanded', String(!guide.hidden));
}

try {
  game = new TowerGame(element('view'));
  start.disabled = false;
  start.querySelector('span')!.textContent = game.hasSave ? '散歩をつづける' : '歩きはじめる';
  game.onFrame = ({ state, placeLabel, action, transitioning, saving, lookMode, looking, visitedCount, keepsakes, accessories, reading, tea, notice, falling, whiteout }) => {
    const indoors = state.place !== 'stairs';
    const atHome = indoors && game.realm.home === state.room;
    hud.classList.toggle('is-falling', falling);
    element('whiteout').style.opacity = String(whiteout);
    element('journey-panel').hidden = !belongings.hidden || !guide.hidden || falling;
    text('home-status', game.realm.home === null ? '自分の家は、まだありません。' : `自分の家：ROOM ${roomNumber(game.realm.home)}`);
    element<HTMLButtonElement>('mark-home').hidden = !indoors;
    element<HTMLButtonElement>('mark-home').disabled = transitioning || looking || atHome;
    text('home-button-label', atHome ? 'ここが自分の家' : 'ここを自分の家にする');
    element<HTMLButtonElement>('jump').hidden = indoors;
    element<HTMLButtonElement>('jump').disabled = !game.canJump;
    text('home-note', indoors ? atHome ? 'この部屋と、ここに置いた物は残ります。' : game.realm.home === null ? '飛び降りたあと、この部屋に帰ります。' : '家を、この部屋に変更します。' : game.realm.home === null ? '部屋に入り、家を決めてください。' : '家と持ち物を残し、ほかの部屋を入れ替える。');
    element<HTMLButtonElement>('inventory-toggle').disabled = falling;
    element<HTMLButtonElement>('fast').disabled = falling;
    element<HTMLButtonElement>('help').disabled = falling;
    text('place-label', placeLabel);
    text('place-tag', indoors ? `ROOM ${roomNumber(state.room)}${atHome ? ' / HOME' : ''}${state.place === 'rest' ? ' / AT REST' : ''}` : falling ? 'IN THE WHITE' : 'THE STAIRWAY');
    text('visited-count', `訪れた部屋 ${visitedCount.toLocaleString('ja-JP')} 室`);
    interaction.hidden = !action || transitioning || !belongings.hidden;
    element('action-label').textContent = action ?? '';
    element('hint').hidden = belongings.hidden && (Boolean(action) || transitioning);
    text('hint', falling ? '白い靄の、その先へ。' : !belongings.hidden ? 'W / S で選ぶ。E で決定、Q で閉じる。' : looking ? 'Esc または同じボタンで戻る。' : indoors ? 'WASD で歩く。椅子のそばで E。' : 'W / S で、上へ、下へ。');
    text('ambient-note', tea ? '湯気が、ほどけていく。' : state.place === 'rest' ? 'しばらく、このまま。' : '行き先は、ありません。');
    element('touch-sides').hidden = !indoors;
    text('save-note', saving ? '位置と持ち物は、このブラウザに保存されます。' : 'このブラウザでは位置と持ち物を保存できません。');
    text('inventory-count', String(keepsakes.filter((item) => item.room === null).length + accessories.length));
    element('room-discovery').hidden = !indoors || !belongings.hidden || transitioning || looking;
    const found = indoors ? roomFind(state.room, keepsakes, game.realm) : null;
    const accessory = indoors ? accessoryFind(state.room, accessories, game.realm) : null;
    text('discovery-text', accessory ? `${ACCESSORY_NAMES[accessoryKind(accessory.source)]}を見つけた。` : found ? `${ITEM_NAMES[itemKind(found.source)]}が置いてある。` : 'この部屋で、少し過ごそう。');
    text('notice', notice);
    element('notice').hidden = !notice || !belongings.hidden || reading !== null;
    renderBelongings(keepsakes, accessories, transitioning || looking || reading !== null);
    if (reading !== null && reading !== shownPostcard) {
      const card = postcard(reading);
      text('postcard-origin', `ROOM ${roomNumber(sourceRoom(reading))} から`);
      text('postcard-title', card.title);
      text('postcard-text', card.text);
      element('postcard-art').style.setProperty('--postcard-color', card.color);
      shownPostcard = reading;
      postcardDialog.showModal();
    } else if (reading === null && postcardDialog.open) {
      postcardDialog.close();
      shownPostcard = null;
    }
    element('fast').setAttribute('aria-pressed', String(game.preferences.pace === 'fast'));
    element('look-back').hidden = !looking;
    for (const button of lookButtons) {
      button.disabled = transitioning || (indoors && button.dataset.look !== 'far');
      button.setAttribute('aria-pressed', String(button.dataset.look === lookMode));
      button.title = indoors && button.dataset.look !== 'far' ? '階段で使えます' : '';
    }
  };

  start.addEventListener('click', startWalk);
  element('pause').addEventListener('click', showMenu);
  element('help').addEventListener('click', toggleGuide);
  element('close-guide').addEventListener('click', toggleGuide);
  element('inventory-toggle').addEventListener('click', toggleBelongings);
  element('close-belongings').addEventListener('click', toggleBelongings);
  element('room-discovery').addEventListener('click', toggleBelongings);
  element('close-postcard').addEventListener('click', () => game.closePostcard());
  element('put-away-postcard').addEventListener('click', () => game.closePostcard());
  postcardDialog.addEventListener('cancel', (event) => { event.preventDefault(); game.closePostcard(); });
  element('belongings-content').addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-item-action]');
    if (!button || button.disabled) return;
    const source = Number(button.dataset.source);
    switch (button.dataset.itemAction) {
      case 'take': game.takeKeepsake(source); break;
      case 'place': game.placeKeepsake(source); break;
      case 'light': game.toggleLantern(source); break;
      case 'read': game.readPostcard(source); break;
      case 'tea': game.drinkTea(); toggleBelongings(); break;
      case 'finish-tea': game.finishTea(); break;
      case 'take-accessory': game.takeAccessory(source); break;
      case 'wear': game.toggleAccessory(source); break;
    }
  });
  element('fast').addEventListener('click', () => game.toggleFast());
  element('mark-home').addEventListener('click', () => { game.markHome(); element('mark-home').blur(); });
  element('jump').addEventListener('click', () => { game.jump(); element('jump').blur(); });
  element('look-back').addEventListener('click', () => game.setLook('walk'));
  for (const button of lookButtons) button.addEventListener('click', () => game.setLook(button.dataset.look as LookMode));
  interaction.addEventListener('click', () => { game.interact(); interaction.blur(); });
  for (const id of ['pace', 'quality']) element(id).addEventListener('change', () => {
    game.setPreferences({
      pace: element<HTMLSelectElement>('pace').value as Preferences['pace'],
      quality: element<HTMLSelectElement>('quality').value as 'standard' | 'light',
    });
  });

  const movement: Record<string, string> = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  };
  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof HTMLSelectElement) return;
    if (event.code === 'Tab' && !menu.hidden) {
      const focusable = [...menu.querySelectorAll<HTMLElement>('button:not(:disabled), select')].filter((node) => node.offsetParent !== null);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      return;
    }
    if (event.code === 'Escape' && !event.repeat) {
      event.preventDefault();
      if (game.reading !== null) game.closePostcard();
      else if (!belongings.hidden) toggleBelongings();
      else if (!guide.hidden) toggleGuide();
      else if (game.running && game.looking) game.setLook('walk');
      else if (game.running) showMenu();
      else if (hasStarted) startWalk();
      return;
    }
    if (!game.running) return;
    if (game.falling) { if (movement[event.code] || ['KeyR', 'KeyT', 'KeyE', 'KeyQ'].includes(event.code)) event.preventDefault(); return; }
    if (game.reading !== null) return;
    if (event.code === 'KeyQ' && !event.repeat) { event.preventDefault(); toggleBelongings(); return; }
    if (!belongings.hidden && (movement[event.code] || event.code === 'KeyE')) {
      event.preventDefault();
      game.input.clear();
      const buttons = [...belongings.querySelectorAll<HTMLButtonElement>('[data-item-action]:not(:disabled)')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.code === 'KeyE') {
        if (!event.repeat) buttons[Math.max(index, 0)]?.click();
      } else if (buttons.length) {
        const delta = ['up', 'left'].includes(movement[event.code]) ? -1 : 1;
        buttons[index < 0 ? 0 : (index + delta + buttons.length) % buttons.length].focus();
      }
      return;
    }
    if (event.code === 'KeyT' && !event.repeat) { event.preventDefault(); game.markHome(); }
    if (event.code === 'KeyR' && !event.repeat && belongings.hidden && guide.hidden) { event.preventDefault(); game.jump(); }
    if (movement[event.code]) { event.preventDefault(); game.input.add(movement[event.code]); }
    if (event.code === 'KeyE' && !event.repeat) { event.preventDefault(); game.interact(); }
    if (event.code === 'KeyH' && !event.repeat) toggleGuide();
    if (event.code === 'KeyF' && !event.repeat) { event.preventDefault(); game.toggleFast(); }
    const views: Record<string, LookMode> = { Digit1: 'down', Digit2: 'up', Digit3: 'far', Numpad1: 'down', Numpad2: 'up', Numpad3: 'far' };
    if (views[event.code] && !event.repeat) { event.preventDefault(); game.setLook(views[event.code]); }
  });
  window.addEventListener('keyup', (event) => { if (movement[event.code]) game.input.delete(movement[event.code]); });
  window.addEventListener('blur', () => { game.input.clear(); if (game.running) showMenu(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.running) showMenu(); });

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-move]')) {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      if (game.running && !game.falling) game.input.add(button.dataset.move!);
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(name, () => game.input.delete(button.dataset.move!));
    }
  }
  if (import.meta.env.DEV) {
    Object.assign(window, { __tower: {
      snapshot: () => game.debugSnapshot(),
      teleport: (steps: number) => game.debugTeleport(steps),
      save: () => game.save(),
    } });
  }
  if (import.meta.hot) import.meta.hot.dispose(() => game.dispose());
} catch (error) {
  console.error(error);
  menu.hidden = true;
  const panel = element('error');
  panel.hidden = false;
  panel.innerHTML = '<h1>塔を描画できませんでした。</h1><p>WebGL 2 が使えるブラウザで開いてください。<br>ブラウザのハードウェア アクセラレーション設定も確認できます。</p><button onclick="location.reload()">もう一度ひらく</button>';
}
