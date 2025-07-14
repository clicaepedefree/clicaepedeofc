import dayjs from 'dayjs'
import 'dayjs/locale/pt'

dayjs.locale('pt')

export const formatDate = (date: Date | string, format: string) =>
  dayjs(date).format(format)
