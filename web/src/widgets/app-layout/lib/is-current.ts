// My courses is current on the home page and on everything under a course;
// any other item on its own page and the pages under it
export const isCurrent = (pathname: string, to: string) =>
  to === '/'
    ? pathname === '/' || pathname.startsWith('/courses/')
    : pathname === to || pathname.startsWith(`${to}/`);
