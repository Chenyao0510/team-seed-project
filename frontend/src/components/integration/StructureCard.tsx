// Bento UI 周辺カード (D15)。
//
// 中心ノードから「飛び出す」演出: 初期 transform は中心ノード位置に重なる
// オフセット (centerOffsetX/Y) + scale 0 + opacity 0 + 大きな回転。
// アニメーションは「回転しながら外側へ → わずかにオーバーシュート → バウンスして着地」
// のキーフレーム配列で表現する。Stagger は親 IntegrationMap が delay で制御する。
import { motion } from 'framer-motion'
import type { IntegrationStructureCategory } from '../../types/state'

const CARD_FLY_DURATION_SECONDS = 1.4
const ELEMENT_STAGGER_SECONDS = 0.07
const ELEMENT_FADE_DURATION_SECONDS = 0.4

interface StructureCardProps {
  category: IntegrationStructureCategory
  gridArea: string
  categoryIndex: number
  highlightedCategoryIndex: number | null
  highlightedElementIndex: number | null
  // 中心ノード位置への変位 (px)。`useRef`+`ResizeObserver` でセクション実寸を測った
  // 親が計算して渡す。0 のときはコンテナ未測定なので呼び出し側で描画を控えるか、
  // 飛び出し演出が省略される（フォールバックとしては許容）。
  centerOffsetX: number
  centerOffsetY: number
  delay: number
}

export function StructureCard({
  category,
  gridArea,
  categoryIndex,
  highlightedCategoryIndex,
  highlightedElementIndex,
  centerOffsetX,
  centerOffsetY,
  delay,
}: StructureCardProps) {
  const isHighlightedCard = highlightedCategoryIndex === categoryIndex

  // キーフレーム列 (t=0 → 1)。各値の配列長は揃える必要がある。
  // 0: 中心位置・小さく・大きく回転・透明
  // 0.3: 中心から少し離れた位置・大きくなる・回転半周
  // 0.65: オーバーシュート（目標を超えて外側）・スケール大きめ・回転終盤
  // 0.85: 戻る・少し小さく
  // 1.0: 着地・通常スケール
  const xKeyframes = [
    centerOffsetX,
    centerOffsetX * 0.35,
    centerOffsetX * -0.18,
    centerOffsetX * 0.06,
    0,
  ]
  const yKeyframes = [
    centerOffsetY,
    centerOffsetY * 0.35,
    centerOffsetY * -0.18,
    centerOffsetY * 0.06,
    0,
  ]
  const scaleKeyframes = [0, 0.45, 1.18, 0.94, 1]
  const opacityKeyframes = [0, 1, 1, 1, 1]
  const rotateKeyframes = [-720, -360, -90, 30, 0]
  const keyframeTimes = [0, 0.3, 0.65, 0.85, 1]

  return (
    <motion.article
      data-testid="integration-structure-cell"
      data-highlighted-card={isHighlightedCard ? 'true' : 'false'}
      data-category-index={categoryIndex}
      style={{ gridArea }}
      initial={{
        x: centerOffsetX,
        y: centerOffsetY,
        scale: 0,
        opacity: 0,
        rotate: -720,
      }}
      animate={{
        x: xKeyframes,
        y: yKeyframes,
        scale: scaleKeyframes,
        opacity: opacityKeyframes,
        rotate: rotateKeyframes,
      }}
      transition={{
        duration: CARD_FLY_DURATION_SECONDS,
        delay,
        ease: 'easeOut',
        times: keyframeTimes,
      }}
      className="z-10 flex flex-col gap-2 self-center justify-self-center rounded-2xl bg-slate-900/40 px-5 py-4 ring-1 ring-slate-700/40 backdrop-blur-sm"
    >
      <h3 className="text-xs uppercase tracking-wider text-slate-400">
        {category.category_name}
      </h3>
      <ul className="space-y-1">
        {category.elements.map((element, elementIndex) => {
          const isHighlightedElement =
            isHighlightedCard && elementIndex === highlightedElementIndex
          return (
            <motion.li
              key={`${category.category_name}-${element}`}
              data-testid="integration-structure-element"
              data-highlighted={isHighlightedElement ? 'true' : 'false'}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: ELEMENT_FADE_DURATION_SECONDS,
                // カード着地（delay + CARD_FLY_DURATION）後に要素が順次フェード
                delay: delay + CARD_FLY_DURATION_SECONDS + (elementIndex + 1) * ELEMENT_STAGGER_SECONDS,
                ease: 'easeOut',
              }}
              className={
                isHighlightedElement
                  ? 'text-base font-semibold text-amber-200'
                  : 'text-sm text-slate-200'
              }
            >
              {element}
            </motion.li>
          )
        })}
      </ul>
    </motion.article>
  )
}

// 親側のステージタイミング計算で参照する公開定数。
export const CARD_FLY_DURATION = CARD_FLY_DURATION_SECONDS
