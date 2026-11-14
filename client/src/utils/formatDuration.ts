export function formatDuration(minutes: number): string {
  const num = Number(minutes);
  if (isNaN(num) || !isFinite(num)) return "0 min";
  const rounded = Math.round(num);
  if (rounded <= 0) return "On time";
  if (rounded < 60) return `${rounded} min`;
  const hrs = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (mins === 0) return `${hrs} hr`;
  return `${hrs} hr ${mins} min`;
}

export function formatPassengerDelay(minutes: number): string {
  const num = Number(minutes);
  if (isNaN(num) || !isFinite(num)) return "On time";
  const rounded = Math.round(num);
  if (rounded === 0) return "On time";
  if (rounded < 0) {
    return `${formatDuration(Math.abs(rounded))} faster`;
  }
  return formatDuration(rounded);
}

export function formatEtaDelay(minutes: number, includePlus = false): string {
  const num = Number(minutes);
  if (isNaN(num) || !isFinite(num)) return "On time";
  const rounded = Math.round(num);
  if (rounded === 0) return "On time";
  const absFormatted = formatDuration(Math.abs(rounded));
  if (rounded < 0) return `${absFormatted} faster`;
  return includePlus ? `+${absFormatted}` : absFormatted;
}
