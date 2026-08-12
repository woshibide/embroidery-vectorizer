export function layoutTreemap(items, x = 0, y = 0, width = 100, height = 100) {
  if (!items.length) return [];
  if (items.length === 1) return [{ layer: items[0], x, y, width, height }];

  const total = items.reduce((sum, layer) => sum + layer.pixels, 0);
  let firstTotal = 0;
  let splitIndex = 1;
  let closest = Infinity;
  for (let i = 1; i < items.length; i++) {
    firstTotal += items[i - 1].pixels;
    const distance = Math.abs(total / 2 - firstTotal);
    if (distance < closest) {
      closest = distance;
      splitIndex = i;
    }
  }

  const first = items.slice(0, splitIndex);
  const second = items.slice(splitIndex);
  firstTotal = first.reduce((sum, layer) => sum + layer.pixels, 0);
  const ratio = total ? firstTotal / total : .5;

  if (width >= height) {
    const firstWidth = width * ratio;
    return [
      ...layoutTreemap(first, x, y, firstWidth, height),
      ...layoutTreemap(second, x + firstWidth, y, width - firstWidth, height)
    ];
  }

  const firstHeight = height * ratio;
  return [
    ...layoutTreemap(first, x, y, width, firstHeight),
    ...layoutTreemap(second, x, y + firstHeight, width, height - firstHeight)
  ];
}
