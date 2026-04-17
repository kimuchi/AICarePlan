/** 和暦日付フォーマットユーティリティ */

/** Date → 「令和X年X月X日」形式に変換 */
export function formatWareki(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  // 令和: 2019年5月1日〜
  if (year >= 2019) {
    const reiwaYear = year - 2018;
    return `令和${reiwaYear === 1 ? '元' : reiwaYear}年${month}月${day}日`;
  }
  // 平成: 1989年1月8日〜2019年4月30日
  if (year >= 1989) {
    const heiseiYear = year - 1988;
    return `平成${heiseiYear === 1 ? '元' : heiseiYear}年${month}月${day}日`;
  }
  return `${year}年${month}月${day}日`;
}

/** 今日の日付を和暦で返す */
export function todayWareki(): string {
  return formatWareki(new Date());
}
