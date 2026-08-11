export interface ReportInterface {
  message: string;
  logs: string;
  device: string;
  id: number;
  // A plain calendar date ("2024-11-02"): the backend column is a SQL date, there is no time or
  // timezone to this value.
  reportingDate: string;
  // The client version the report came from; absent on rows predating the field.
  version?: string;
}

// Renders a report's calendar date in the viewer's language. Formatting is pinned to UTC because
// the value is a bare date: "2024-11-02" parses as UTC midnight, and letting Intl re-read that
// instant in the viewer's zone would show November 1st to anyone west of Greenwich.
export function formatReportDate(
  reportingDate: string,
  locale: string,
): string {
  if (!reportingDate) return "";
  const date = new Date(reportingDate);
  if (isNaN(date.getTime())) return reportingDate;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date);
}
