// The fields of Canvas's REST answers the connector reads
// (canvas.instructure.com/doc/api). An item's raw keeps the whole object.

export interface Course {
  id: number;
  // the nickname the token's user gave the course, if any
  name: string;
  // the course's own name, there only when it has a nickname
  original_name?: string;
  course_code: string;
  start_at: string | null;
  end_at: string | null;
  term?: { name: string; start_at: string | null; end_at: string | null };
  // listed, but not open to its students yet: only the id comes
  access_restricted_by_date?: boolean;
}

// a course's navigation: a student gets only the tabs shown to them
export interface Tab {
  id: string;
  hidden?: boolean;
}

export interface Module {
  id: number;
  name: string;
  // left out when a module has too many, listed on their own then
  items?: ModuleItem[];
}

export interface ModuleItem {
  type: string;
  // a File's id
  content_id?: number;
  // a Page's url name
  page_url?: string;
}

// an announcement: a discussion topic, sharing the topics' ids
export interface Topic {
  id: number;
  title: string;
  html_url: string;
  posted_at: string | null;
  is_section_specific?: boolean;
  attachments?: CanvasFile[];
}

export interface Page {
  page_id: number;
  // its url name in the course
  url: string;
  title: string;
  html_url: string;
}

export interface Assignment {
  id: number;
  name: string;
  html_url: string;
  only_visible_to_overrides?: boolean;
  visible_to_everyone?: boolean;
}

export interface CanvasFile {
  id: number;
  display_name: string;
  folder_id: number;
  // the download, with the file's verifier; '' while it is locked for the
  // token's user
  url: string;
  size: number;
  'content-type': string;
  modified_at?: string;
  updated_at: string;
}

export interface Folder {
  id: number;
  // 'course files/Lectures/2026'
  full_name: string;
}

export interface Token {
  expires_at: string | null;
}
