export interface ContextMenu<T> {
  title: string;
  data: MenuData[];
  metaData: T;
}

export interface MenuData {
  display: string;
  key: string;
  class: string;
}
