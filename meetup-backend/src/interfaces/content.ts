/** Динамический where для фильтрации контента */
export interface ContentWhereInput {
  contentTags?: { some: { tagId: number } }
  favorites?: { some: { userId: number } }
}

/** Данные для обновления контента */
export interface ContentUpdateData {
  title?: string
  type?: string
  body?: string | null
  mediaUrl?: string | null
  fileName?: string | null
}
