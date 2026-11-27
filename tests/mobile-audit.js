// Mobile layout audit. Open http://localhost:5173/tests/mobile-preview.html?audit
// with the dev server running (online manifest). It loads the app in iframes of
// several phone/tablet sizes, walks every screen, and reports:
//   - controls that can't be tapped because something else is on top
//   - controls or text visually covered by something painted above them
//   - controls / text pushed off screen
//   - tap targets under 44px, text under 11px, truncated text
// The result table is shown on the page and logged; the tab title becomes
// "Mobile audit: PASS" or "Mobile audit: N issues".

const SIZES = [
  [320, 568],
  [390, 844],
  [430, 932],
  [568, 320],
  [844, 390],
  [768, 1024],
];
const SCALES = ['planetary', 'galaxy', 'cosmos'];
const MIN_TAP_PX = 44;
const MIN_TEXT_PX = 11;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Check one document as it is right now. Returns [type, selector, detail][] */
export function auditDocument(doc) {
  const win = doc.defaultView;
  const W = win.innerWidth;
  const H = win.innerHeight;
  const issues = [];
  const visible = (el) =>
    el.getClientRects().length > 0 &&
    el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const describe = (el) =>
    el.tagName.toLowerCase() +
    [...el.classList]
      .slice(0, 2)
      .map((c) => '.' + c)
      .join('');
  const label = (el) =>
    (el.getAttribute('aria-label') || el.textContent || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 40);
  const clampPoint = (x, y) => [
    Math.min(Math.max(x, 0), W - 1),
    Math.min(Math.max(y, 0), H - 1),
  ];
  const related = (a, b) => a === b || a.contains(b) || b.contains(a);
  // Anything covering half the screen is a modal layer, not a clash.
  const isFullScreenLayer = (el) => {
    const r = el.getBoundingClientRect();
    return r.width * r.height >= 0.5 * W * H;
  };
  const paints = (el) => {
    if (/^(img|video|canvas|svg|input)$/i.test(el.tagName)) return true;
    const cs = win.getComputedStyle(el);
    const rgba = cs.backgroundColor.match(/[\d.]+/g);
    if (rgba && (rgba.length < 4 || parseFloat(rgba[3]) > 0.15)) return true;
    if (cs.backgroundImage !== 'none') return true;
    return [...el.childNodes].some((n) => n.nodeType === 3 && n.data.trim());
  };
  const inScrollArea = (el) => {
    for (let p = el.parentElement; p && p !== doc.body; p = p.parentElement) {
      const overflow = win.getComputedStyle(p).overflowY;
      if (
        (overflow === 'auto' || overflow === 'scroll') &&
        p.scrollHeight > p.clientHeight + 1
      ) {
        return true;
      }
    }
    return false;
  };

  const pageWidth = Math.max(doc.documentElement.scrollWidth, doc.body.scrollWidth);
  if (pageWidth > W + 1)
    issues.push(['page-overflow-x', 'html', `${pageWidth}px > ${W}px`]);

  const controls = [
    ...doc.querySelectorAll('button, a[href], input, select, [role="button"]'),
  ].filter(visible);

  // Pass 1: real hit-testing.
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.left < -1 || r.right > W + 1)
      issues.push(['control-off-screen-x', describe(el), label(el)]);
    if (!inScrollArea(el) && (r.top < -1 || r.bottom > H + 1)) {
      issues.push(['control-off-screen-y', describe(el), label(el)]);
    }
    if (r.bottom <= 0 || r.top >= H) continue;
    if (
      el.type !== 'range' &&
      (r.width < MIN_TAP_PX - 0.5 || r.height < MIN_TAP_PX - 0.5)
    ) {
      issues.push([
        'tap-target-small',
        describe(el),
        `${label(el)} (${Math.round(r.width)}x${Math.round(r.height)})`,
      ]);
    }
    const top = doc.elementFromPoint(
      ...clampPoint(r.left + r.width / 2, r.top + r.height / 2),
    );
    if (
      top &&
      !related(top, el) &&
      !isFullScreenLayer(top) &&
      win.getComputedStyle(el).pointerEvents !== 'none'
    ) {
      issues.push(['tap-blocked', describe(el), `${label(el)} by ${describe(top)}`]);
    }
  }

  // Pass 2: visual stacking. Make pointer-events:none layers (logos, chrome)
  // hit-testable so they count as covering things.
  const force = doc.createElement('style');
  force.textContent = '* { pointer-events: auto !important; }';
  doc.head.appendChild(force);
  const coveredBy = (el, x, y) => {
    const stack = doc.elementsFromPoint(x, y);
    const index = stack.findIndex((s) => related(s, el));
    if (index < 0) return null;
    const above = stack.slice(0, index).filter((s) => !related(s, el));
    if (above.some((s) => isFullScreenLayer(s) && paints(s))) return null;
    return above.find((s) => paints(s) && visible(s)) ?? null;
  };
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.bottom <= 0 || r.top >= H) continue;
    const cover = coveredBy(
      el,
      ...clampPoint(r.left + r.width / 2, r.top + r.height / 2),
    );
    if (cover)
      issues.push([
        'control-covered',
        describe(el),
        `${label(el)} by ${describe(cover)}`,
      ]);
  }
  const smallTextSeen = new Set();
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.data.trim().slice(0, 30);
    const el = node.parentElement;
    if (!text || !el || !visible(el)) continue;
    const range = doc.createRange();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    if (r.width < 1 || r.bottom <= 0 || r.top >= H) continue;
    const cs = win.getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    if (size < MIN_TEXT_PX && !smallTextSeen.has(describe(el) + size)) {
      smallTextSeen.add(describe(el) + size);
      issues.push(['text-small', describe(el), `${size}px "${text}"`]);
    }
    if (r.left < -1 || r.right > W + 1)
      issues.push(['text-off-screen-x', describe(el), text]);
    const clipped =
      (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) ||
      (cs.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 1);
    if (clipped) issues.push(['text-truncated', describe(el), text]);
    const cover = coveredBy(
      el,
      ...clampPoint(r.left + r.width / 2, r.top + r.height / 2),
    );
    if (cover)
      issues.push(['text-covered', describe(el), `"${text}" by ${describe(cover)}`]);
  }
  force.remove();

  return issues;
}

// Overlaps that are by design: an open menu / dialog / gallery covering the
// screen underneath it, and gallery hexes panned partly out of view.
function isExpected([type, selector, detail], state) {
  if (selector.includes('gallery-overlay__node')) return true;
  if (type === 'tap-blocked' && /display-menu__/.test(detail)) return true;
  if (
    type === 'tap-blocked' &&
    /entry-overlay__button|entry-overlay__info-button|view-switcher__/.test(selector) &&
    /menu|gallery|entry-info|selector/.test(state)
  ) {
    return true;
  }
  return false;
}

/** Drive one app iframe through every screen, calling report(state, issues). */
async function walk(frame, report) {
  const doc = () => frame.contentDocument;
  const mode = () => doc().querySelector('#app')?.dataset.mode;
  const until = async (fn, ms = 15000) => {
    const start = Date.now();
    while (Date.now() - start < ms) {
      try {
        if (fn()) return true;
      } catch {
        // app still booting
      }
      await sleep(150);
    }
    return false;
  };
  const button = (pattern, root = doc()) =>
    [...root.querySelectorAll('button')].find(
      (b) => b.getClientRects().length && pattern.test(b.textContent.trim()),
    );
  const audit = async (state) => {
    await sleep(700);
    report(state, auditDocument(doc()));
  };
  const burger = () =>
    doc().querySelector('[aria-label="Open configuration overlay"]').click();
  const closeConfig = async () => {
    const close = [
      ...doc().querySelectorAll('.config-overlay__close, [aria-label="Back"]'),
    ].find((b) => b.getClientRects().length);
    close?.click();
    await sleep(800);
  };
  const touchTap = (el) => {
    const win = doc().defaultView;
    const r = el.getBoundingClientRect();
    const init = {
      pointerId: 1,
      pointerType: 'touch',
      clientX: r.x + r.width / 2,
      clientY: r.y + r.height / 2,
      bubbles: true,
      cancelable: true,
    };
    const target = doc().elementFromPoint(init.clientX, init.clientY);
    target.dispatchEvent(new win.PointerEvent('pointerover', init));
    target.dispatchEvent(new win.PointerEvent('pointerdown', init));
    doc()
      .querySelector('.gallery-overlay__viewport')
      .dispatchEvent(new win.PointerEvent('pointerup', init));
  };
  const step = async (state, fn) => {
    try {
      await fn();
    } catch (error) {
      report(state, [['audit-script-error', '-', String(error).slice(0, 100)]]);
    }
  };

  await until(() => doc().querySelector('[aria-label="Open configuration overlay"]'));
  await sleep(1200);
  await audit('entry');
  await step('entry-info', async () => {
    doc().querySelector('[aria-label="About this experience"]').click();
    await audit('entry-info');
    doc().querySelector('.entry-info-modal__close')?.click();
    await sleep(400);
  });

  for (const scale of SCALES) {
    await step(`${scale}/config`, async () => {
      [...doc().querySelectorAll('.entry-overlay__button')][
        SCALES.indexOf(scale)
      ].click();
      await sleep(1200);
      await audit(`${scale}/config`);
      doc().querySelector('.run-button')?.scrollIntoView();
      await audit(`${scale}/config-bottom`);
      burger();
      await sleep(300);
      button(/^home$/i).click();
      await sleep(800);
    });
    await step(`${scale}/gallery`, async () => {
      if (mode() !== 'entry') {
        burger();
        await sleep(300);
        button(/^home$/i).click();
        await sleep(800);
      }
      burger();
      await sleep(300);
      await audit(`${scale}/entry-menu`);
      button(/^galler/i).click();
      await sleep(500);
      await audit(`${scale}/gallery-selector`);
      button(
        new RegExp('^' + scale, 'i'),
        doc().querySelector('.gallery-selector-overlay'),
      ).click();
      await until(
        () =>
          doc().querySelectorAll('.gallery-overlay__node:not(.is-pending)').length > 5,
      );
      await audit(`${scale}/gallery`);
      const area = doc()
        .querySelector('.gallery-overlay__viewport')
        .getBoundingClientRect();
      const hex = [...doc().querySelectorAll('.gallery-overlay__node')].find((n) => {
        const r = n.getBoundingClientRect();
        return (
          r.x > area.x + 10 &&
          r.right < area.right - 10 &&
          r.y > area.y + 10 &&
          r.bottom < area.bottom - 10
        );
      });
      touchTap(hex);
      await audit(`${scale}/gallery-selected`);
      doc().querySelector('.gallery-overlay__play').click();
    });
    await step(`${scale}/display`, async () => {
      if (await until(() => mode() === 'initializing', 4000))
        await audit(`${scale}/initializing`);
      await until(
        () => mode() === 'display' && doc().querySelector('video')?.currentTime > 0.3,
        30000,
      );
      await sleep(2500); // let the collapsible chrome settle
      await audit(`${scale}/display`);
      burger();
      await sleep(400);
      await audit(`${scale}/display-menu`);
      burger();
      await sleep(400);
      for (const [pattern, state] of [
        [/^settings$/i, 'settings'],
        [/^credits$/i, 'credits'],
      ]) {
        burger();
        await sleep(400);
        button(pattern).click();
        await sleep(900);
        await audit(`${scale}/${state}`);
        await closeConfig();
      }
    });
    await step(`${scale}/summary`, async () => {
      const video = doc().querySelector('video');
      video.currentTime = Math.max(0, video.duration - 0.3);
      await until(() => doc().querySelector('.overlay--summary.is-visible'), 15000);
      await sleep(1200);
      await audit(`${scale}/summary`);
      const summary = doc().querySelector('.overlay--summary');
      summary.scrollTop = summary.scrollHeight;
      await audit(`${scale}/summary-bottom`);
      summary.scrollTop = 0;
      const card = doc().querySelector('.res-card--has-info');
      if (card) {
        card.click();
        await sleep(500);
        await audit(`${scale}/summary-detail`);
        doc().querySelector('.sci-modal__close')?.click();
        await sleep(300);
      }
      button(/^home$/i, doc().querySelector('.summary-overlay__actions'))?.click();
      await sleep(800);
    });
  }
}

/** Run the full audit inside `container`, then render the report there. */
export async function runMobileAudit(container) {
  document.title = 'Mobile audit: running…';
  const rows = [];
  let screens = 0;
  await Promise.all(
    SIZES.map(async ([width, height]) => {
      const frame = document.createElement('iframe');
      frame.src = '/';
      frame.style.cssText = `width:${width}px;height:${height}px;border:0;background:#000`;
      container.appendChild(frame);
      await walk(frame, (state, issues) => {
        screens += 1;
        for (const issue of issues) {
          if (!isExpected(issue, state))
            rows.push({
              size: `${width}x${height}`,
              state,
              type: issue[0],
              element: issue[1],
              detail: issue[2],
            });
        }
      });
    }),
  );

  // Collapse identical findings across sizes / screens.
  const grouped = new Map();
  for (const row of rows) {
    const key = [row.type, row.element, row.detail].join('|');
    const entry = grouped.get(key) ?? { ...row, where: new Set() };
    entry.where.add(`${row.size} ${row.state}`);
    grouped.set(key, entry);
  }
  const findings = [...grouped.values()].map(({ type, element, detail, where }) => ({
    type,
    element,
    detail,
    where: [...where].join(', '),
  }));

  console.table(findings);
  document.title = findings.length
    ? `Mobile audit: ${findings.length} issues`
    : 'Mobile audit: PASS';
  const report = document.createElement('pre');
  report.style.cssText =
    'width:100%;color:#eee;font:12px/1.4 monospace;white-space:pre-wrap';
  report.textContent =
    `${screens} screens checked at ${SIZES.length} sizes: ` +
    (findings.length
      ? `${findings.length} issues\n\n` +
        findings
          .map((f) => `${f.type}  ${f.element}  ${f.detail}\n    ${f.where}`)
          .join('\n')
      : 'no issues');
  container.prepend(report);

  return findings;
}
