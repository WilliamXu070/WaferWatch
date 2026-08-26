export function getCalendarWeekRange(now = new Date()) {
  const from = new Date(now);
  const day = from.getDay();
  from.setDate(from.getDate() + (day === 0 ? -6 : 1 - day));
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  return { from: from.toISOString(), to: to.toISOString() };
}
