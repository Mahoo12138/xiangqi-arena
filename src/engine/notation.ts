import type { Move, Piece, Side } from '../types'
import { pieceName, sideOf } from './board'

// 中文字符：一二三四五六七八九
const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九']

// 从某方视角把全局 file(0-8) 映射为列号（1-9）
// 红：file 从红右侧(i=0)往左编号；黑：file 从黑右侧(a)往右编号
function fileFromSide(file: number, side: Side): number {
  return side === 'red' ? FILE_TO_RED[file] : file + 1
}

const FILE_TO_RED = [9, 8, 7, 6, 5, 4, 3, 2, 1]

// 红方用中文字，黑方用阿拉伯数字
function numStr(file: number, side: Side): string {
  return side === 'red' ? CN_NUM[file - 1] ?? String(file) : String(file)
}

// 字母（红大写、黑小写，马用 H/h）
function pieceLetter(p: Piece): string {
  return p
}

// 生成中文记谱与 WXF 记法
export function notation(move: Move): { cn: string; wxf: string } {
  const side = sideOf(move.piece)
  const type = move.piece.toUpperCase()
  const fromFile = move.from.file
  const toFile = move.to.file
  const dr = move.to.rank - move.from.rank
  const df = toFile - fromFile

  const sameFile = df === 0

  // 进/退：红进=rank增大，黑进=rank减小
  const advancingRed = side === 'red' ? dr > 0 : dr < 0
  const steps = Math.abs(dr)

  // 中文名
  const cnPiece = pieceName(move.piece)
  const fromNumCn = numStr(fileFromSide(fromFile, side), side)
  const toNumCn = numStr(fileFromSide(toFile, side), side)

  // WXF 基础
  const wxfPiece = pieceLetter(move.piece)
  const fromNumAr = fileFromSide(fromFile, side)

  let cn = ''
  let wxf = ''

  if (sameFile) {
    // 纵向移动：进/退。
    // 车/炮/帅/将/兵/卒 用移动步数；马/相/仕 用目标列号。
    const action = advancingRed ? '进' : '退'
    const wxfAction = advancingRed ? '+' : '-'
    const useStepCount = type === 'R' || type === 'C' || type === 'K' || type === 'P'
    if (useStepCount) {
      cn = `${cnPiece}${fromNumCn}${action}${numStr(steps, side)}`
      wxf = `${wxfPiece}${fromNumAr}${wxfAction}${steps}`
    } else {
      // 马/相/士：进到某列
      cn = `${cnPiece}${fromNumCn}${action}${toNumCn}`
      wxf = `${wxfPiece}${fromNumAr}${wxfAction}${fileFromSide(toFile, side)}`
    }
  } else {
    // 横向移动：平
    if (type === 'P' || type === 'K' || type === 'R' || type === 'C') {
      cn = `${cnPiece}${fromNumCn}平${toNumCn}`
      wxf = `${wxfPiece}${fromNumAr}=${fileFromSide(toFile, side)}`
    } else {
      // 马/相/士：斜向移动，分进/退到某列
      const action = advancingRed ? '进' : '退'
      const wxfAction = advancingRed ? '+' : '-'
      cn = `${cnPiece}${fromNumCn}${action}${toNumCn}`
      wxf = `${wxfPiece}${fromNumAr}${wxfAction}${fileFromSide(toFile, side)}`
    }
  }

  return { cn, wxf }
}