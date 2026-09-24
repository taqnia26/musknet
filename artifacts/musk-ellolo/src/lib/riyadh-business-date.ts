const riyadhDateFormatter = new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
  timeZone: 'Asia/Riyadh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatRiyadhBusinessDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const parts = riyadhDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) throw new RangeError('Invalid date for Asia/Riyadh business calendar');
  return `${year}-${month}-${day}`;
}