import { foodData } from './data/food-data.js?v=cleaned-2219';

const ITEMS_PER_PAGE = 24;
const GROUPS_PER_PAGE = 6;
const ITEMS_PER_GROUP = 5;
const LOTTERY_STEPS = 16;
const LOTTERY_INTERVAL_MS = 55;

const preferenceRules = {
  all: () => true,
  full: (food) => hasAny(food, ['大荤', '小荤', '主食', '盖饭', '套餐', '饭', '面', '粉', '饺', '锅']),
  spicy: (food) => hasAny(food, ['辣', '麻', '香锅', '水煮', '冒菜', '小面', '酸辣', '椒', '重庆']),
  light: (food) => hasAny(food, ['粥', '汤', '素', '青菜', '沙拉', '清汤', '馄饨', '鱼粉', '豆腐']) && !hasAny(food, ['辣', '麻辣']),
  noodle: (food) => hasAny(food, ['面', '粉', '米线', '河粉', '土豆粉', '刀削', '拌面']),
  rice: (food) => hasAny(food, ['饭', '盖饭', '焖饭', '煲仔', '套餐', '石锅', '铁板']),
  snack: (food) => hasAny(food, ['小吃', '饼', '包', '卷', '炸', '烤肠', '鸡排', '薯条', '寿司']),
  drink: (food) => hasAny(food, ['饮品', '饮料', '奶茶', '咖啡', '果茶', '柠檬', '豆浆', '可乐', '水吧'])
};

const elements = {
  form: document.querySelector('#decisionForm'),
  preference: document.querySelector('#preference'),
  budget: document.querySelector('#budget'),
  keyword: document.querySelector('#keyword'),
  question: document.querySelector('#question'),
  askButton: document.querySelector('#askButton'),
  clearButton: document.querySelector('#clearButton'),
  answer: document.querySelector('#answer'),
  drawButton: document.querySelector('#drawButton'),
  surpriseButton: document.querySelector('#surpriseButton'),
  drawCard: document.querySelector('#drawCard'),
  ticketText: document.querySelector('#ticketText'),
  itemCount: document.querySelector('#itemCount'),
  shopCount: document.querySelector('#shopCount'),
  matchCount: document.querySelector('#matchCount'),
  menuSummary: document.querySelector('#menuSummary'),
  foodList: document.querySelector('#foodList'),
  sortMode: document.querySelector('#sortMode'),
  viewButtons: [...document.querySelectorAll('[data-view]')],
  prevPage: document.querySelector('#prevPage'),
  nextPage: document.querySelector('#nextPage'),
  pageInfo: document.querySelector('#pageInfo')
};

const state = {
  menuView: 'category',
  currentPage: 1
};

const foods = foodData.items.map(([shopId, categoryId, name, price]) => {
  const shop = foodData.shops[shopId];
  return {
    name,
    price,
    category: foodData.categories[categoryId],
    shop: shop.raw,
    shopName: shop.name,
    location: shop.location,
    campus: foodData.campuses[shop.campus]
  };
});

init();

function init() {
  elements.itemCount.textContent = foodData.summary.itemCount.toLocaleString('zh-CN');
  elements.shopCount.textContent = foodData.summary.shopCount.toLocaleString('zh-CN');
  bindEvents();
  renderList();
}

function bindEvents() {
  elements.form.addEventListener('input', () => {
    state.currentPage = 1;
    renderList();
  });
  elements.sortMode.addEventListener('input', () => {
    state.currentPage = 1;
    renderList();
  });
  elements.viewButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.menuView = button.dataset.view;
      state.currentPage = 1;
      elements.viewButtons.forEach((item) => item.classList.toggle('is-active', item === button));
      renderList();
    });
  });
  elements.prevPage.addEventListener('click', () => changePage(-1));
  elements.nextPage.addEventListener('click', () => changePage(1));
  elements.askButton.addEventListener('click', answerQuestion);
  elements.clearButton.addEventListener('click', clearQuestion);
  elements.drawButton.addEventListener('click', () => runLottery(getFilteredFoods()));
  elements.surpriseButton.addEventListener('click', () => runLottery(foods));
}

function getSelectedCampus() {
  return document.querySelector('input[name="campus"]:checked')?.value || 'all';
}

function getFilteredFoods(extra = {}) {
  const campus = extra.campus || getSelectedCampus();
  const preference = extra.preference || elements.preference.value;
  const budget = Number(extra.budget || elements.budget.value);
  const keyword = normalize(extra.keyword ?? elements.keyword.value);
  const rule = preferenceRules[preference] || preferenceRules.all;

  return foods.filter((food) => {
    if (campus !== 'all' && food.campus !== campus) return false;
    if (Number(food.price) > budget) return false;
    if (!rule(food)) return false;
    if (keyword && !normalize(foodText(food)).includes(keyword)) return false;
    return true;
  });
}

function renderList() {
  const filtered = sortFoods(getFilteredFoods());
  elements.matchCount.textContent = filtered.length.toLocaleString('zh-CN');
  elements.foodList.className = `food-list ${state.menuView === 'plain' ? 'plain-list' : 'grouped-list'}`;

  if (!filtered.length) {
    elements.menuSummary.textContent = '没有匹配项。';
    elements.foodList.innerHTML = '<div class="empty">没有匹配项。把预算放宽一点，或少填几个关键词。</div>';
    updatePager(1, 1);
    return;
  }

  if (state.menuView === 'plain') {
    renderPlainList(filtered);
    return;
  }

  renderGroupedList(filtered, state.menuView === 'shop' ? 'shop' : 'category');
}

function renderPlainList(filtered) {
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  state.currentPage = clamp(state.currentPage, 1, totalPages);
  const pageItems = paginate(filtered, state.currentPage, ITEMS_PER_PAGE);
  elements.menuSummary.textContent = `平铺显示 ${filtered.length} 个候选，每页 ${ITEMS_PER_PAGE} 个。`;
  elements.foodList.innerHTML = pageItems.map(renderFoodCard).join('');
  updatePager(state.currentPage, totalPages);
}

function renderGroupedList(filtered, key) {
  const groups = makeGroups(filtered, key);
  const totalPages = Math.max(1, Math.ceil(groups.length / GROUPS_PER_PAGE));
  state.currentPage = clamp(state.currentPage, 1, totalPages);
  const pageGroups = paginate(groups, state.currentPage, GROUPS_PER_PAGE);
  const label = key === 'shop' ? '窗口' : '分类';
  elements.menuSummary.textContent = `按${label}整理成 ${groups.length} 组，每组先露出 ${ITEMS_PER_GROUP} 个。`;
  elements.foodList.innerHTML = pageGroups.map(renderMenuGroup).join('');
  updatePager(state.currentPage, totalPages);
}

function makeGroups(list, key) {
  const map = new Map();
  for (const food of list) {
    const name = food[key];
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(food);
  }
  return [...map.entries()]
    .map(([name, items]) => ({ name, items: sortFoods(items) }))
    .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name, 'zh-CN'));
}

function renderMenuGroup(group) {
  const visibleItems = group.items.slice(0, ITEMS_PER_GROUP);
  const hiddenCount = group.items.length - visibleItems.length;
  const moreText = hiddenCount > 0 ? `<div class="compact-food"><span class="food-count">还有 ${hiddenCount} 个，换页或缩小筛选会更好找。</span></div>` : '';
  return `
    <article class="menu-group">
      <header class="group-head">
        <h3>${escapeHtml(group.name)}</h3>
        <span class="food-count">${group.items.length} 个</span>
      </header>
      <div class="group-items">
        ${visibleItems.map(renderCompactFood).join('')}
        ${moreText}
      </div>
    </article>
  `;
}

function renderCompactFood(food) {
  return `
    <div class="compact-food">
      <div>
        <strong title="${escapeHtml(food.name)}">${escapeHtml(food.name)}</strong>
        <div class="food-meta">
          <span>${escapeHtml(food.shop)}</span>
          <span>${escapeHtml(food.category)}</span>
        </div>
      </div>
      <span class="compact-price">${formatPrice(food.price)}</span>
    </div>
  `;
}

function changePage(delta) {
  state.currentPage += delta;
  renderList();
  document.querySelector('#list').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updatePager(page, totalPages) {
  elements.pageInfo.textContent = `第 ${page} / ${totalPages} 页`;
  elements.prevPage.disabled = page <= 1;
  elements.nextPage.disabled = page >= totalPages;
}

function answerQuestion() {
  const text = elements.question.value.trim();
  const parsed = parseQuestion(text);
  const candidates = getQuestionCandidates(parsed);
  const picks = shuffle(candidates).slice(0, 3);

  if (!text) {
    elements.answer.innerHTML = '<div class="empty">先写一句，比如“我在沙河，想吃辣一点，15 元以内”。</div>';
    return;
  }

  if (!picks.length) {
    elements.answer.innerHTML = '<div class="empty">暂时没找到能吃的一顿。换个更常见的词，比如“饭”“面”“辣”“奶茶”。</div>';
    return;
  }

  const note = buildAnswerNote(parsed, candidates.length);
  elements.answer.innerHTML = `<p class="plain-note">${escapeHtml(note)}</p>${picks.map(renderFoodCard).join('')}`;
  updateTicket(picks[0]);
}

function getQuestionCandidates(parsed) {
  const attempts = [
    () => getFilteredFoods(parsed),
    () => filterQuestionFoods(parsed, { fuzzyKeyword: true }),
    () => filterQuestionFoods(parsed, { fuzzyKeyword: true, ignoreKeyword: true }),
    () => filterQuestionFoods(parsed, { fuzzyKeyword: true, ignoreKeyword: true, ignoreBudget: true }),
    () => filterQuestionFoods(parsed, { fuzzyKeyword: true, ignoreKeyword: true, ignoreBudget: true, ignorePreference: true }),
    () => foods
  ];

  for (const attempt of attempts) {
    const result = attempt();
    if (result.length) return result;
  }
  return [];
}

function filterQuestionFoods(parsed, options = {}) {
  const campus = parsed.campus;
  const budget = options.ignoreBudget ? 999 : Number(parsed.budget || elements.budget.value || 999);
  const preference = options.ignorePreference ? 'all' : (parsed.preference || elements.preference.value || 'all');
  const rule = preferenceRules[preference] || preferenceRules.all;
  const keyword = options.ignoreKeyword ? '' : normalize(parsed.keyword || '');

  return foods.filter((food) => {
    if (campus && food.campus !== campus) return false;
    if (Number(food.price) > budget) return false;
    if (!rule(food)) return false;
    if (keyword && !matchesKeyword(food, keyword, options.fuzzyKeyword)) return false;
    return true;
  });
}

function matchesKeyword(food, keyword, fuzzy) {
  const text = normalize(foodText(food));
  if (!keyword || text.includes(keyword)) return true;
  if (!fuzzy) return false;
  return keywordTerms(keyword).some((term) => text.includes(term));
}

function keywordTerms(keyword) {
  const value = normalize(keyword);
  const terms = new Set();
  for (let size = Math.min(4, value.length); size >= 2; size -= 1) {
    for (let index = 0; index <= value.length - size; index += 1) {
      terms.add(value.slice(index, index + size));
    }
  }
  if (!terms.size && value) terms.add(value);
  return [...terms];
}

function clearQuestion() {
  elements.question.value = '';
  elements.answer.innerHTML = '';
  elements.keyword.value = '';
  elements.preference.value = 'all';
  elements.budget.value = '15';
  document.querySelector('input[name="campus"][value="all"]').checked = true;
  state.currentPage = 1;
  renderList();
}

function parseQuestion(text) {
  const normalized = normalize(text);
  const parsed = { keyword: '' };

  if (normalized.includes('沙河')) parsed.campus = '沙河校区';
  if (normalized.includes('本部') || normalized.includes('西土城') || normalized.includes('西土城路')) parsed.campus = '西土城路校区';

  if (hasText(normalized, ['辣', '麻辣', '香锅', '水煮', '重庆'])) parsed.preference = 'spicy';
  else if (hasText(normalized, ['清淡', '素', '粥', '汤'])) parsed.preference = 'light';
  else if (hasText(normalized, ['面', '粉', '米线'])) parsed.preference = 'noodle';
  else if (hasText(normalized, ['饭', '盖饭', '套餐'])) parsed.preference = 'rice';
  else if (hasText(normalized, ['小吃', '垫', '零食'])) parsed.preference = 'snack';
  else if (hasText(normalized, ['喝', '奶茶', '饮料', '咖啡'])) parsed.preference = 'drink';
  else if (hasText(normalized, ['饱', '顶饿', '管饱'])) parsed.preference = 'full';

  const budgetMatch = normalized.match(/(\d{1,2})\s*(元|块|以内|以下|内)?/);
  if (budgetMatch) parsed.budget = Number(budgetMatch[1]);

  parsed.keyword = extractKeyword(normalized);
  return parsed;
}

function extractKeyword(text) {
  const stopWords = ['我', '今天', '想', '吃', '喝', '一点', '点', '在', '校区', '以内', '以下', '别超过', '不要超过', '元', '块', '的', '给我', '推荐', '沙河', '本部', '西土城', '西土城路', '辣一点', '辣的', '麻辣', '清淡', '便宜', '贵', '不贵', '随便', '都行'];
  let result = text;
  for (const word of stopWords) {
    result = result.replaceAll(word, ' ');
  }
  result = result.replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim();
  return result.length >= 2 ? result : '';
}

function buildAnswerNote(parsed, count) {
  const parts = [];
  if (parsed.campus) parts.push(parsed.campus.replace('校区', ''));
  if (parsed.preference) parts.push(preferenceLabel(parsed.preference));
  if (parsed.budget) parts.push(`${parsed.budget} 元以内`);
  if (parsed.keyword) parts.push(`含“${parsed.keyword}”`);
  const prefix = parts.length ? `按 ${parts.join('、')} 筛了一遍` : '按你这句话粗略筛了一遍';
  return `${prefix}，还剩 ${count} 个候选。先看这三个。`;
}

function runLottery(pool) {
  if (!pool.length) {
    elements.drawCard.innerHTML = '<span class="draw-shop">没有候选</span><strong>抽不动</strong><span class="draw-meta">放宽条件再试</span>';
    return;
  }

  let step = 0;
  elements.drawCard.classList.add('is-spinning');
  elements.drawButton.disabled = true;
  elements.surpriseButton.disabled = true;

  const timer = window.setInterval(() => {
    const food = randomItem(pool);
    renderDraw(food);
    step += 1;

    if (step >= LOTTERY_STEPS) {
      window.clearInterval(timer);
      const finalFood = randomItem(pool);
      renderDraw(finalFood);
      updateTicket(finalFood);
      elements.drawCard.classList.remove('is-spinning');
      elements.drawButton.disabled = false;
      elements.surpriseButton.disabled = false;
    }
  }, LOTTERY_INTERVAL_MS);
}

function renderDraw(food) {
  elements.drawCard.innerHTML = `
    <span class="draw-shop">${escapeHtml(food.shop)}</span>
    <strong>${escapeHtml(food.name)}</strong>
    <span class="draw-meta">${escapeHtml(food.campus)} · ${escapeHtml(food.category)} · ${formatPrice(food.price)}</span>
  `;
}

function updateTicket(food) {
  elements.ticketText.textContent = food.name;
}

function renderFoodCard(food) {
  return `
    <article class="food-card">
      <strong>${escapeHtml(food.name)}</strong>
      <div class="food-meta">
        <span>${escapeHtml(food.campus)}</span>
        <span>${escapeHtml(food.shop)}</span>
        <span>${escapeHtml(food.category)}</span>
      </div>
      <span class="food-price">${formatPrice(food.price)}</span>
    </article>
  `;
}

function sortFoods(list) {
  const mode = elements.sortMode?.value || 'shuffle';
  if (mode === 'priceAsc') return [...list].sort((a, b) => a.price - b.price || a.name.localeCompare(b.name, 'zh-CN'));
  if (mode === 'priceDesc') return [...list].sort((a, b) => b.price - a.price || a.name.localeCompare(b.name, 'zh-CN'));
  if (mode === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  return shuffle(list);
}

function paginate(list, page, size) {
  return list.slice((page - 1) * size, page * size);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function hasAny(food, words) {
  const text = normalize(foodText(food));
  return words.some((word) => text.includes(normalize(word)));
}

function hasText(text, words) {
  return words.some((word) => text.includes(normalize(word)));
}

function foodText(food) {
  return `${food.name} ${food.shop} ${food.shopName} ${food.location} ${food.category} ${food.campus}`;
}

function preferenceLabel(value) {
  return elements.preference.querySelector(`option[value="${value}"]`)?.textContent || value;
}

function formatPrice(price) {
  return `${Number(price).toFixed(Number.isInteger(Number(price)) ? 0 : 1)} 元`;
}

function randomItem(list) {
  const safeList = list.filter((food) => Number(food.price) > 0);
  const pool = safeList.length ? safeList : list;
  return pool[Math.floor(Math.random() * pool.length)];
}

function shuffle(list) {
  return [...list].sort(() => Math.random() - 0.5);
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
}
