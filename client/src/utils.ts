/** Date → 「令和X年X月X日」 */
export function formatWareki(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (year >= 2019) {
    const ry = year - 2018;
    return `令和${ry === 1 ? '元' : ry}年${month}月${day}日`;
  }
  if (year >= 1989) {
    const hy = year - 1988;
    return `平成${hy === 1 ? '元' : hy}年${month}月${day}日`;
  }
  return `${year}年${month}月${day}日`;
}
