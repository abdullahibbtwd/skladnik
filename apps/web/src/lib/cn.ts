export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function fefoPillClass(status: 'urgent' | 'warning' | 'safe') {
  return cn(
    'inline-flex items-center justify-center gap-1 whitespace-nowrap rounded px-[0.45rem] py-[0.18rem] text-[0.65rem] font-medium',
    status === 'urgent' && 'border border-ops-danger/20 bg-rose-50 text-ops-danger',
    status === 'warning' && 'border border-ops-warn/20 bg-orange-50 text-ops-warn',
    status === 'safe' && 'border border-ops-teal/20 bg-teal-50 text-ops-teal',
  );
}

