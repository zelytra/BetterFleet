export interface ContextMenu {
  title: string
  data: MenuData[]
}

export interface MenuData {
  display: string
  key:string
  class: string
}