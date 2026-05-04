import { NextResponse } from 'next/server';
import { getCalendarEvents } from '@/lib/calendar/actions';

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function formatIcsDate(value: string, allDay: boolean): string {
  const date = new Date(value);
  if (allDay) return date.toISOString().slice(0, 10).replace(/-/g, '');
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const start = url.searchParams.get('start') ?? new Date().toISOString();
  const end = url.searchParams.get('end') ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const events = await getCalendarEvents({
    start,
    end,
    includeFinance: true,
    includeLettings: true,
    includeReminders: true,
  });

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ChurchLedger//Calendar//EN',
    ...events.flatMap((event) => [
      'BEGIN:VEVENT',
      `UID:${escapeIcs(event.id)}@churchledger`,
      `DTSTAMP:${formatIcsDate(new Date().toISOString(), false)}`,
      `DTSTART${event.allDay ? ';VALUE=DATE' : ''}:${formatIcsDate(event.startAt, event.allDay)}`,
      ...(event.endAt ? [`DTEND${event.allDay ? ';VALUE=DATE' : ''}:${formatIcsDate(event.endAt, event.allDay)}`] : []),
      `SUMMARY:${escapeIcs(event.title)}`,
      ...(event.description ? [`DESCRIPTION:${escapeIcs(event.description)}`] : []),
      ...(event.location ? [`LOCATION:${escapeIcs(event.location)}`] : []),
      `CATEGORIES:${escapeIcs(event.category)}`,
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ];

  return new NextResponse(lines.join('\r\n'), {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'attachment; filename="church-calendar.ics"',
    },
  });
}
