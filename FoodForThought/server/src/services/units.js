const UNIT_ALIASES = {
  g: 'g', gram: 'g', grams: 'g', gm: 'g',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  tsp: 'tsp', tsps: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  tbsp: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  cup: 'cup', cups: 'cup',
  '': 'pcs', pc: 'pcs', pcs: 'pcs', piece: 'pcs', pieces: 'pcs', whole: 'pcs',
  small: 'pcs', medium: 'pcs', large: 'pcs', clove: 'pcs', cloves: 'pcs', slice: 'pcs', slices: 'pcs',
}

const UNIT_BASE = {
  g: ['weight', 1], kg: ['weight', 1000],
  ml: ['volume', 1], l: ['volume', 1000], tsp: ['volume', 4.93], tbsp: ['volume', 14.79], cup: ['volume', 240],
  pcs: ['count', 1],
}

function unitInfo(unit) {
  const key = String(unit ?? '').trim().toLowerCase().replace(/\.$/, '')
  const base = UNIT_BASE[UNIT_ALIASES[key]]
  return base ? { group: base[0], factor: base[1] } : null
}

const LIQUIDS = [
  ['condensed milk', 1.3], ['evaporated milk', 1.05], ['coconut milk', 1], ['coconut cream', 1],
  ['honey', 1.42], ['syrup', 1.33], ['oil', 0.92], ['oyster sauce', 1.2], ['kecap manis', 1.3],
  ['soy sauce', 1.1], ['fish sauce', 1.2], ['sauce', 1.05], ['vinegar', 1], ['milk', 1.03],
  ['cream', 1], ['stock', 1], ['broth', 1], ['water', 1], ['juice', 1.04], ['wine', 1],
  ['mirin', 1.1], ['extract', 1], ['essence', 1],
]

const SOLIDS = [
  ['brown sugar', 0.92], ['icing sugar', 0.5], ['powdered sugar', 0.5], ['caster sugar', 0.83], ['sugar', 0.83],
  ['rice flour', 0.53], ['corn flour', 0.53], ['cornflour', 0.53], ['cornstarch', 0.53], ['corn starch', 0.53],
  ['tapioca', 0.53], ['flour', 0.52], ['baking soda', 0.93], ['baking powder', 0.8], ['yeast', 0.6],
  ['salt', 1.2], ['pepper', 0.5], ['powder', 0.5], ['cinnamon', 0.5], ['cumin', 0.5], ['turmeric', 0.5],
  ['paprika', 0.5], ['msg', 0.9], ['cocoa', 0.35],
  ['rice', 0.77], ['quinoa', 0.71], ['lentil', 0.79], ['couscous', 0.73], ['oat', 0.38],
  ['breadcrumb', 0.25], ['panko', 0.25], ['butter', 0.95], ['peanut butter', 1.08], ['ghee', 0.9],
  ['cream cheese', 0.95], ['cheese', 0.42], ['yogurt', 1.03], ['yoghurt', 1.03], ['mayonnaise', 0.95], ['ketchup', 1.1],
  ['sesame seed', 0.6], ['peanut', 0.6], ['almond', 0.6], ['cashew', 0.6], ['nut', 0.6],
  ['chocolate chip', 0.7], ['desiccated coconut', 0.35], ['raisin', 0.6],
  ['garlic', 0.57], ['ginger', 0.57], ['paste', 1.1],
]

function nameWords(name) {
  const { normalizeIngredient } = require('./ingredientnames')
  return ` ${normalizeIngredient(name)} `
}
const hasPhrase = (words, phrase) => words.includes(` ${phrase} `)

const KNOWN = [
  ...LIQUIDS.map(([phrase, gPerMl]) => ({ phrase, gPerMl, liquid: true })),
  ...SOLIDS.map(([phrase, gPerMl]) => ({ phrase, gPerMl, liquid: false })),
]
function densityOf(name) {
  if (!name) return null
  const words = nameWords(name)
  const found = KNOWN.filter((k) => hasPhrase(words, k.phrase))
  if (!found.length) return null
  const atEnd = (k) => words.endsWith(` ${k.phrase} `)
  found.sort((a, b) => (atEnd(b) - atEnd(a)) || (b.phrase.length - a.phrase.length))
  return { gPerMl: found[0].gPerMl, liquid: found[0].liquid }
}

function convertAmount(amount, fromUnit, toUnit, ingredientName) {
  const from = unitInfo(fromUnit)
  const to = unitInfo(toUnit)
  if (!from || !to) return null
  if (from.group === to.group) return (amount * from.factor) / to.factor

  const density = densityOf(ingredientName)
  if (!density) return null
  if (from.group === 'volume' && to.group === 'weight') return (amount * from.factor * density.gPerMl) / to.factor
  if (from.group === 'weight' && to.group === 'volume') return (amount * from.factor) / density.gPerMl / to.factor
  return null
}

const SPOON_UNITS = ['tsp', 'tbsp', 'cup']
const isSpoonUnit = (unit) => SPOON_UNITS.includes(UNIT_ALIASES[String(unit ?? '').trim().toLowerCase().replace(/\.$/, '')])

const tidy = (n) => (n < 10 ? Math.round(n * 10) / 10 : Math.round(n))

function toPantryUnit(amount, unit, ingredientName) {
  const key = String(unit ?? '').trim().toLowerCase().replace(/\.$/, '')
  const pantryUnit = UNIT_ALIASES[key] || key
  const quantity = Number(amount)
  if (!SPOON_UNITS.includes(pantryUnit)) return { quantity, unit: pantryUnit }

  const ml = quantity * UNIT_BASE[pantryUnit][1]
  const density = densityOf(ingredientName)
  if (density && !density.liquid) return { quantity: tidy(ml * density.gPerMl), unit: 'g' }
  return { quantity: tidy(ml), unit: 'ml' }
}

module.exports = { unitInfo, convertAmount, densityOf, toPantryUnit, isSpoonUnit, SPOON_UNITS }
