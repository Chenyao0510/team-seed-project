import { useEffect, useState, useRef, Fragment, useCallback } from "react";
import { AnimatePresence, motion, useIsPresent } from "framer-motion";
import type {
  Character,
  DebateState,
  DebateStatus,
  ChatHistoryEntry,
  Gender,
  ReflectionSummary,
  AgentThought,
} from "../types/state";
import {
  addCharacter,
  nextTurn,
  reflection,
  think,
  API_BASE_URL,
} from "../api/client";
import { Typewriter } from "../components/debate/Typewriter";

// PointsPanel (T33) のアニメーション秒数（CONSTRAINTS.md: マジックナンバー禁止）。
// 1ターンで「追加=最大1 / 入れ替え=最大1」を Gemini 側で強制し (D11 prompt)、
// フロントは差分を派手に演出する: 新規は NEW バッジ + emerald glow をしっかり残し、
// 削除は line-through で滞留させてから去る。
const POINTS_ENTER_DURATION = 0.55;
const POINTS_NEW_HIGHLIGHT_DURATION = 3.5; // NEW バッジ表示時間
const POINTS_GLOW_DURATION = 2.8; // glow 減衰時間
const POINTS_EXIT_DURATION = 1.1; // line-through を見せるためゆっくり
const POINTS_GLOW_BOX_SHADOW = "0 0 32px rgba(52, 211, 153, 0.95)";
const POINTS_NO_BOX_SHADOW = "0 0 0px rgba(52, 211, 153, 0)";
const POINTS_NEW_BG = "rgba(16, 185, 129, 0.35)"; // emerald-500 + alpha
const POINTS_KEPT_BG = "rgba(51, 65, 85, 0.6)"; // slate-700/60

interface DebateStageProps {
  state: DebateState;
  onOpenHistory?: () => void;
  onStateChange?: (newState: DebateState) => void;
  onIntervene?: (next: DebateState) => void;
  onAddCharacter?: (character: Character) => void;
  onSummarize?: () => void;
  isSummarizing?: boolean;
}

type InterventionKind = "objection" | "viewpoint" | "question";

const INTERVENTION_LABEL: Record<InterventionKind, string> = {
  objection: "異議",
  viewpoint: "観点",
  question: "質問",
};

// 深掘り優先ルール (DEPTH FIRST DISCUSSION RULE) で各発言が既存の論点に対して
// 行う「手」のラベル。current_move_type の表示に使う。
const MOVE_TYPE_LABEL: Record<string, string> = {
  deepen: "深掘り",
  challenge: "反論",
  clarify: "明確化",
  connect: "接続",
  new: "新規",
};

// ユーザーがアバター未登録 (state.user.avatar_url が空) のときのフォールバック表示 (T58)。
const USER_AVATAR_FALLBACK = "https://placeholder.example/user.png";

// ユーザー介入の発言者名（roster 外固定値。/api/next_turn が roster 外発言を
// 「ユーザー介入」として扱い、次の AI がそれに反応する: DECISIONS D11）。
const USER_SPEAKER = "あなた";

// T70: TTS プリフェッチ用ヘルパー。speaker + speech + gender を一意なキーにする。
// （同じキャラクターでも発言が違えば別 wav なので speech も含める）
function buildTtsUrl(
  speaker: string,
  speech: string,
  gender: Gender | undefined,
): string {
  const genderQuery = gender ? `&gender=${gender}` : "";
  return `${API_BASE_URL}/api/tts?text=${encodeURIComponent(speech)}&character_name=${encodeURIComponent(speaker)}${genderQuery}`;
}

function ttsCacheKey(
  speaker: string,
  speech: string,
  gender: Gender | undefined,
): string {
  return `${speaker}|${gender ?? ""}|${speech}`;
}

// hook と body から current_speech 相当の文字列を合成する
// (backend/app/debate.py の _compose_speech と同じロジック)。
function composeSpeech(hook: string, body: string): string {
  return `${hook} ${body}`.trim();
}

// ユーザー介入で state を上書きする前に、画面表示中の発言を chat_history に
// アーカイブする (backend/app/debate.py の _archive_current_speech と同じ条件)。
// これにより、介入直前に表示されていたキャラの発言が履歴・次の AI の文脈から
// 失われることを防ぐ。
function archiveCurrentSpeech(state: DebateState): ChatHistoryEntry[] {
  if (!state.current_speech || state.status !== "speaking") {
    return state.chat_history;
  }
  if (
    state.active_character === state.user.name ||
    state.active_character === USER_SPEAKER
  ) {
    return state.chat_history;
  }

  const last = state.chat_history[state.chat_history.length - 1];
  const isDuplicate =
    last !== undefined &&
    last.speaker === state.active_character &&
    last.text === state.current_speech;
  if (isDuplicate) {
    return state.chat_history;
  }

  const character = state.characters.find(
    (c) => c.name === state.active_character,
  );
  const newEntry: ChatHistoryEntry = {
    speaker: state.active_character,
    text: state.current_speech,
    avatar_url: character?.avatar_url ?? "",
    emotion: state.emotion,
  };
  return [...state.chat_history, newEntry];
}

// Reflection Turn (T26/T27): 何ターンごとに一時停止して Reflection Panel を表示するか。
// turn_count は backend が `/api/next_turn` のたびに+1して返す値（ユーザー介入はカウントしない）。
const REFLECTION_INTERVAL = 10;

export function DebateStage({
  state,
  onOpenHistory,
  onStateChange,
  onIntervene,
  onAddCharacter,
  onSummarize,
  isSummarizing = false,
}: DebateStageProps) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAddCharOpen, setIsAddCharOpen] = useState(false);
  const isActive = (name: string) => state.active_character === name;
  const [intervention, setIntervention] = useState<InterventionKind | null>(
    null,
  );
  const [showReflection, setShowReflection] = useState(false);
  const [reflectionSummary, setReflectionSummary] =
    useState<ReflectionSummary | null>(null);
  const [reflectionLoading, setReflectionLoading] = useState(false);
  const [prefetchedReflection, setPrefetchedReflection] =
    useState<ReflectionSummary | null>(null);
  // 「現在の turn_count に対して既に reflection を表示済みか」を追跡する。
  // reflection 経由で介入 → submit すると active_character=user になるが turn_count は
  // 進まないため、次の「次へ」でモーダルが再オープンするのを防ぐためのガード。
  const [reflectionShownForTurn, setReflectionShownForTurn] = useState<
    number | null
  >(null);

  // T70: TTS プリフェッチ・キャッシュ。`think` が返した agent_thoughts の中で
  // willingness=true な候補全員ぶんを並列に fetch → Blob URL に変換して保持する。
  // 「次へ」クリックで決まった speaker のキャッシュが命中していれば、ネットワーク往復
  // ゼロで即再生できる（ハッカソン尺の体験向上が最優先）。
  // Map<cacheKey, blobUrl | "pending">。"pending" は二重発火防止のセンチネル。
  const ttsCacheRef = useRef<Map<string, string>>(new Map());

  // Stage アンマウント時に Blob URL を解放する。途中で発言が切り替わっても、
  // 既に作った Blob URL は他キャラの prefetch から参照される可能性があるため、
  // 個別キーごとには revoke せず Stage 一括で破棄する（生存時間 = 議論セッション中）。
  useEffect(() => {
    const cache = ttsCacheRef.current;
    return () => {
      for (const url of cache.values()) {
        if (url && url !== "pending") {
          URL.revokeObjectURL(url);
        }
      }
      cache.clear();
    };
  }, []);

  const resolveTtsUrl = useCallback(
    (speaker: string, speech: string, gender: Gender | undefined): string => {
      const cached = ttsCacheRef.current.get(ttsCacheKey(speaker, speech, gender));
      if (cached && cached !== "pending") {
        return cached;
      }
      return buildTtsUrl(speaker, speech, gender);
    },
    [],
  );

  // T70: agent_thoughts (think の結果) が乗ったら、willing な候補全員ぶんの TTS を
  // バックグラウンドで取りに行く。fetch → blob → URL.createObjectURL でキャッシュに
  // 保存。失敗時はキーを消して、本番再生時の通常 URL fallback に任せる。
  useEffect(() => {
    const thoughts = state.agent_thoughts;
    if (!thoughts) return;
    const cache = ttsCacheRef.current;

    for (const [name, thought] of Object.entries(thoughts)) {
      if (!thought.willingness_to_speak) continue;
      const speech = composeSpeech(thought.hook, thought.body);
      if (!speech) continue;
      const gender = state.characters.find((c) => c.name === name)?.gender;
      const key = ttsCacheKey(name, speech, gender);
      if (cache.has(key)) continue;
      cache.set(key, "pending");

      void (async () => {
        try {
          const response = await fetch(buildTtsUrl(name, speech, gender));
          if (!response.ok) throw new Error(`tts prefetch ${response.status}`);
          const blob = await response.blob();
          // prefetch 完了より先にアンマウントが走った場合は cache が空になっている
          if (!cache.has(key)) return;
          cache.set(key, URL.createObjectURL(blob));
        } catch (err) {
          console.warn(`[T70] TTS prefetch failed for ${name}:`, err);
          cache.delete(key);
        }
      })();
    }
  }, [state.agent_thoughts, state.characters]);

  const existingNames = state.characters.map((c) => c.name);

  const handleAddCharacter = async (character: Character) => {
    onAddCharacter?.(character);
    setIsAddCharOpen(false);
  };

  const submitIntervention = (kind: InterventionKind, text: string) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    const interventionText = `（${INTERVENTION_LABEL[kind]}）${trimmed}`;
    onIntervene?.({
      ...state,
      // 介入で上書きする前に、画面表示中だったキャラの発言を履歴に残す。
      chat_history: archiveCurrentSpeech(state),
      active_character: state.user.name,
      current_speech: interventionText,
      current_hook: "",
      current_body: interventionText,
      current_reasoning_target: "",
      current_concepts: [],
      current_focus_point: "",
      current_move_type: "",
      status: "speaking",
      agent_thoughts: {},
    });
    setIntervention(null);
    // 介入後は文脈が変わるためキャッシュをクリア (T65)
    setPrefetchedReflection(null);
  };

  const handleOpenHistory = () => {
    setIsHistoryOpen(true);
    if (onOpenHistory) onOpenHistory();
  };

  const handleReflectionIntervention = (kind: InterventionKind) => {
    setShowReflection(false);
    setPrefetchedReflection(null);
    setIntervention(kind);
  };

  // 実際に /api/next_turn を叩いて 1 ターン進める処理。reflection 表示の判断は
  // 含めず、呼び出し側 (handleNextTurn / handleReflectionContinue / 初回 mount)
  // で制御する。
  // 次が reflection ターンになる手前で /api/reflection を先取りしてキャッシュする (T65)。
  const performAdvance = async () => {
    if (isGenerating || !onStateChange) return;
    setIsGenerating(true);
    try {
      const newState = await nextTurn(state);
      onStateChange(newState);
      if (
        newState.turn_count % REFLECTION_INTERVAL ===
        REFLECTION_INTERVAL - 1
      ) {
        reflection(newState)
          .then((summary) => setPrefetchedReflection(summary))
          .catch((err) =>
            console.error("Pre-fetch reflection failed:", err),
          );
      }
    } catch (err) {
      console.error(err);
      alert("API呼び出しに失敗しました");
    } finally {
      setIsGenerating(false);
    }
  };

  // ユーザーが「次へ」を押したときのハンドラ。次が reflection ターンに当たる場合は
  // **state を進めずに** モーダルを開く。これにより「次の AI 発言／TTS／立ち絵が
  // モーダル裏でリークする」問題を防ぐ。reflectionShownForTurn でこのターンの
  // モーダルを表示済みかを記録し、reflection → 介入 submit 後の再「次へ」で
  // モーダルが再オープンするのを防ぐ。
  const handleNextTurn = async () => {
    if (isGenerating || !onStateChange) return;
    const nextWillBeReflection =
      (state.turn_count + 1) % REFLECTION_INTERVAL === 0;
    if (nextWillBeReflection && reflectionShownForTurn !== state.turn_count) {
      setShowReflection(true);
      setReflectionShownForTurn(state.turn_count);
      if (prefetchedReflection) {
        setReflectionSummary(prefetchedReflection);
        setReflectionLoading(false);
      } else {
        setReflectionSummary(null);
        setReflectionLoading(true);
        reflection(state)
          .then((summary) => setReflectionSummary(summary))
          .catch((err) => console.error(err))
          .finally(() => setReflectionLoading(false));
      }
      return;
    }
    await performAdvance();
  };

  // 「見守る（このまま次へ）」: モーダルを閉じて実際に 1 ターン進める。
  // handleNextTurn の reflection チェックを通すと再オープンしてしまうため、
  // performAdvance を直接呼ぶ。
  const handleReflectionContinue = () => {
    setShowReflection(false);
    setPrefetchedReflection(null);
    void performAdvance();
  };

  const handleThink = useCallback(
    async (currentState: DebateState) => {
      if (isGenerating || !onStateChange) return;
      // すでに思考結果がある、または待機中以外はスキップ（多重発火防止）
      if (
        currentState.status !== "speaking" ||
        (currentState.agent_thoughts &&
          Object.keys(currentState.agent_thoughts).length > 0)
      ) {
        return;
      }

      // status: thinking への遷移はバックエンドで行われるが、
      // フロントエンドでも即座に isGenerating を true にしてガードする
      setIsGenerating(true);
      try {
        const newState = await think(currentState);
        // 通信中にユーザーが介入ボタンを押した場合は、結果を反映しない (T63)
        if (interventionRef.current === null) {
          onStateChange(newState);
        }
      } catch (err) {
        console.error("Auto-think failed:", err);
      } finally {
        setIsGenerating(false);
      }
    },
    [isGenerating, onStateChange],
  );

  // 最新の intervention 状態を参照するための Ref
  // think() は非同期で、await 中に intervention が変化することがあるため、
  // 完了時点で最新値を参照できるよう Ref に同期しておく
  const interventionRef = useRef<InterventionKind | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    interventionRef.current = intervention;
  }, [intervention]);

  // 発言が完了したタイミングで自動的に「思考」を開始する (T63)。
  // ただし、active_character がユーザー（介入直後）の場合は自動発火しない:
  // 介入直後に think が走ると介入発言の TelopBox が即座に "発言の準備が整いました"
  // に切り替わってしまい、ユーザーから見ると「次へを押してないのに進んでいる」状態に
  // なるため。介入後の進行は必ず明示的な「次へ」クリックで起こす。
  useEffect(() => {
    if (
      state.status === "speaking" &&
      state.current_speech !== "" &&
      !isGenerating
    ) {
      const isUserSpeaker =
        state.active_character === state.user.name ||
        state.active_character === USER_SPEAKER;
      if (isUserSpeaker) return;
      // ユーザーが介入モード（モーダル入力中など）でないことを確認
      if (intervention === null && !isAddCharOpen && !showReflection) {
        const timer = setTimeout(() => {
          void handleThink(state);
        }, 1500); // 少し待ってから思考開始（読了感のため）
        return () => clearTimeout(timer);
      }
    }
  }, [
    state.current_speech,
    state.status,
    state.active_character,
    state.user.name,
    isGenerating,
    intervention,
    isAddCharOpen,
    showReflection,
    handleThink,
    state,
  ]);

  // 最初の発言がない場合は自動でAPIを叩いて会話を始める。
  // 初回ターン（turn_count 0 → 1）は reflection 対象外（1 % 3 != 0）のため、
  // reflection モーダル判定は不要。reflection の先取りキャッシュも初回はスキップ
  // (まだ chat_history が薄く要約も無意味)。
  useEffect(() => {
    let mounted = true;
    const initTurn = async () => {
      if (!onStateChange) return;
      setIsGenerating(true);
      try {
        const newState = await nextTurn(state);
        if (mounted) {
          onStateChange(newState);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setIsGenerating(false);
      }
    };

    if (state.chat_history.length === 0 && state.current_speech === "") {
      void initTurn();
    }
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden text-slate-100"
      style={{
        background: 'radial-gradient(ellipse 120% 80% at 50% 40%, #0f1e1a 0%, #0a1628 40%, #060d18 100%)',
      }}
    >
      {/* Ambient glow — top (pure emerald, strong) */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-30 h-48"
        style={{
          background: 'radial-gradient(ellipse 75% 100% at 50% 0%, rgba(52, 211, 153, 0.28) 0%, rgba(16, 185, 129, 0.12) 40%, transparent 100%)',
        }}
      />
      <Header
        theme={state.theme}
        onOpenHistory={handleOpenHistory}
      />

      <main className="relative flex flex-1 flex-col gap-6 px-6 py-6 overflow-hidden">
        <div className="flex flex-1 gap-6 relative z-10">
          <div className="shrink-0 pointer-events-auto">
            <PointsPanel
              points={state.current_points}
              focusPoint={state.current_focus_point}
            />
          </div>

          <section className="flex flex-1 flex-col relative">
            {/* 立ち絵レイヤー（ギャルゲー風配置） */}
            <div className="absolute inset-x-0 bottom-20 top-0 flex justify-center items-end pointer-events-none z-0">
              {/* Stage floor spotlight — characters stand in emerald light */}
              <div
                className="absolute inset-x-0 bottom-0 h-48 pointer-events-none"
                style={{
                  background: 'radial-gradient(ellipse 70% 100% at 50% 100%, rgba(52, 211, 153, 0.18) 0%, rgba(16, 185, 129, 0.06) 50%, transparent 100%)',
                }}
              />
              {/* Subtle vignette on sides */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(90deg, rgba(6, 13, 24, 0.55) 0%, transparent 25%, transparent 75%, rgba(6, 13, 24, 0.55) 100%)',
                }}
              />
              <CharactersRow
                characters={state.characters}
                isActive={(name) =>
                  intervention || showReflection ? false : isActive(name)
                }
                status={state.status}
                userName={state.user.name}
                userAvatarUrl={state.user.avatar_url || USER_AVATAR_FALLBACK}
                emotion={state.emotion}
                agentThoughts={
                  intervention || showReflection ? {} : state.agent_thoughts
                }
                isUserActive={
                  !!intervention || showReflection || isActive(state.user.name)
                }
              />
            </div>

            <div className="relative flex flex-col justify-end flex-1 z-10 pointer-events-none">
              <div className="pointer-events-auto w-full relative">
                <TelopBox
                  speaker={state.active_character}
                  speech={state.current_speech}
                  hook={state.current_hook}
                  body={state.current_body}
                  reasoningTarget={state.current_reasoning_target}
                  concepts={state.current_concepts}
                  moveType={state.current_move_type}
                  status={isGenerating ? "thinking" : state.status}
                  intervention={intervention}
                  onCancel={() => setIntervention(null)}
                  onSubmit={(text) => submitIntervention(intervention!, text)}
                  userName={state.user.name}
                  agentThoughts={state.agent_thoughts}
                  characters={state.characters}
                  resolveTtsUrl={resolveTtsUrl}
                />
                {/* 進行ボタンをテロップ横か下に配置 */}
                <div className="mx-auto mt-4 flex max-w-3xl justify-end">
                  <button
                    type="button"
                    onClick={handleNextTurn}
                    disabled={isGenerating}
                    className="rounded bg-emerald-600 px-6 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isGenerating ? "思考中..." : "次へ ❯"}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="relative z-20 pointer-events-auto">
          <ActionBar
            intervention={intervention}
            onSelectIntervention={setIntervention}
            interventionEnabled={onIntervene !== undefined}
            addCharacterEnabled={onAddCharacter !== undefined}
            onOpenAddCharacter={() => setIsAddCharOpen(true)}
            summarizeEnabled={onSummarize !== undefined}
            isSummarizing={isSummarizing}
            onSummarize={() => onSummarize?.()}
          />
        </div>
      </main>

      {isAddCharOpen && (
        <AddCharacterModal
          existingNames={existingNames}
          onClose={() => setIsAddCharOpen(false)}
          onCreated={handleAddCharacter}
        />
      )}

      {/* History Drawer Overlay & Panel */}
      {isHistoryOpen && (
        <div className="absolute inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsHistoryOpen(false)}
            data-testid="history-overlay"
          />
          <aside
            data-testid="history-drawer"
            className="relative flex w-full max-w-sm flex-col border-l border-slate-700 bg-slate-800 shadow-2xl transition-transform"
          >
            <div className="flex items-center justify-between border-b border-slate-700 p-4">
              <h2 className="text-lg font-semibold text-slate-100">過去ログ</h2>
              <button
                type="button"
                onClick={() => setIsHistoryOpen(false)}
                data-testid="close-history-button"
                className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-100"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {state.chat_history.length === 0 ? (
                <p className="text-center text-sm text-slate-500">
                  ログはまだありません
                </p>
              ) : (
                state.chat_history.map((entry, i) => (
                  <ChatHistoryItem key={i} entry={entry} />
                ))
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Reflection Turn (T26): 一定ターンごとに討論を一時停止し、ユーザーに主導権を返す */}
      {showReflection && (
        <ReflectionPanel
          currentTopic={state.current_topic}
          characters={state.characters}
          summary={reflectionSummary}
          loading={reflectionLoading}
          onContinue={handleReflectionContinue}
          onSelectIntervention={handleReflectionIntervention}
        />
      )}

      <CouncilGateOpening />
    </div>
  );
}

interface ReflectionPanelProps {
  currentTopic: string;
  characters: DebateState["characters"];
  summary: ReflectionSummary | null;
  loading: boolean;
  onContinue: () => void;
  onSelectIntervention: (kind: InterventionKind) => void;
}

const REFLECTION_INTERVENTION: {
  kind: InterventionKind;
  label: string;
  testId: string;
}[] = [
  { kind: "objection", label: "異議を唱える", testId: "reflection-objection" },
  { kind: "viewpoint", label: "観点追加", testId: "reflection-add-viewpoint" },
  { kind: "question", label: "質問", testId: "reflection-question" },
];

// Reflection Panel (T26/T26残作業): AIによる「足りない視点」「追加すべき人物」の提案は禁止。
// 認知負荷を最小化するため、現在の論点と「対立構造マップ」(VS表示) のみを示し、
// ユーザーは「見守る」か「発言する」かのどちらかを選ぶだけでよい。
function ReflectionPanel({
  currentTopic,
  characters,
  summary,
  loading,
  onContinue,
  onSelectIntervention,
}: ReflectionPanelProps) {
  // 論点は直近2件のみ表示する（古い論点は折り返しなしで切り捨てる）。
  const blocks = (summary?.blocks ?? []).slice(-2);
  const [showInterventionChoices, setShowInterventionChoices] = useState(false);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <section
        data-testid="reflection-panel"
        className="mx-4 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border-2 border-emerald-400/60 bg-slate-800 p-8 shadow-2xl"
      >
        <p className="mb-1 text-xs uppercase tracking-wider text-emerald-300">
          Reflection Turn
        </p>
        <h2
          data-testid="reflection-topic"
          className="mb-6 text-xl font-bold text-slate-100"
          title={currentTopic}
        >
          現在の論点：{currentTopic || "未設定"}
        </h2>

        {loading ? (
          <p
            className="mb-6 text-center text-sm text-slate-400"
            data-testid="reflection-loading"
          >
            対立構造を読み込み中...
          </p>
        ) : blocks.length > 0 ? (
          <div className="mb-6 space-y-4" data-testid="reflection-blocks">
            {blocks.map((block) => (
              <div key={block.topic} data-testid="reflection-block">
                {blocks.length > 1 && (
                  <p className="mb-2 text-center text-xs text-slate-400">
                    {block.topic}
                  </p>
                )}
                <VsRow stances={block.stances} characters={characters} />
              </div>
            ))}
          </div>
        ) : (
          <div className="mb-6 space-y-2" data-testid="reflection-participants">
            <p className="text-center text-xs text-slate-400">参加者</p>
            <ul className="flex justify-center gap-3">
              {characters.map((c) => (
                <li key={c.name} className="flex flex-col items-center">
                  <div className="h-12 w-12 overflow-hidden rounded-full bg-slate-700 ring-2 ring-slate-600">
                    <img
                      src={c.avatar_url}
                      alt=""
                      className="h-full w-full object-cover object-top"
                    />
                  </div>
                  <span className="mt-1 text-xs text-slate-300">{c.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3 border-t border-slate-700 pt-4">
          {showInterventionChoices ? (
            REFLECTION_INTERVENTION.map(({ kind, label, testId }) => (
              <button
                key={kind}
                type="button"
                data-testid={testId}
                onClick={() => onSelectIntervention(kind)}
                className="rounded-md border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-300"
              >
                {label}
              </button>
            ))
          ) : (
            <>
              <button
                type="button"
                data-testid="reflection-intervene"
                onClick={() => setShowInterventionChoices(true)}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500"
              >
                発言する（異議/観点/質問）
              </button>
              <button
                type="button"
                data-testid="reflection-continue"
                onClick={onContinue}
                className="rounded-md border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-300"
              >
                このまま議論を見守る（次へ）
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

interface VsRowProps {
  stances: ReflectionSummary["blocks"][number]["stances"];
  characters: DebateState["characters"];
}

// 対立構造マップ。
// 立場が2つの場合: [アイコンA] ラベル(立場)  VS  ラベル(立場) [アイコンB] の左右ミラー表示。
// 立場が3つ以上の場合: 同じ立場の人物をひとつのブロックにまとめ、ブロックを縦に積んで
// 間に "VS" の区切りを挟む（3人目・4人目以降の立場も同じ形式でブロックを追加するだけで
// 拡張できる）。
function VsRow({ stances, characters }: VsRowProps) {
  if (stances.length === 2) {
    return (
      <div className="flex items-center gap-3">
        <StanceChip stance={stances[0]} characters={characters} />
        <span className="shrink-0 text-xs font-bold text-slate-500">VS</span>
        <StanceChip stance={stances[1]} characters={characters} reverse />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {stances.map((stance, i) => (
        <Fragment key={stance.label}>
          <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
            <StanceChip stance={stance} characters={characters} />
          </div>
          {i < stances.length - 1 && (
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <span className="h-px flex-1 bg-slate-700" />
              VS
              <span className="h-px flex-1 bg-slate-700" />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}

interface StanceChipProps {
  stance: ReflectionSummary["blocks"][number]["stances"][number];
  characters: DebateState["characters"];
  reverse?: boolean;
}

// 立場ごとのチップ。label を太字で強調し、summary はその下に小さめのグレー文字で常時表示する。
function StanceChip({ stance, characters, reverse }: StanceChipProps) {
  return (
    <div
      data-testid="reflection-stance"
      className={`flex flex-1 items-center gap-2 ${reverse ? "flex-row-reverse text-right" : ""}`}
    >
      {stance.characters.length > 0 && (
        <ul
          className={`flex shrink-0 flex-col -space-y-2 ${reverse ? "items-end" : "items-start"}`}
        >
          {stance.characters.map((name) => {
            const character = characters.find((c) => c.name === name);
            return (
              <li
                key={name}
                title={name}
                className="h-10 w-10 overflow-hidden rounded-full bg-slate-700 ring-2 ring-slate-900"
              >
                {character && (
                  <img
                    src={character.avatar_url}
                    alt={name}
                    className="h-full w-full object-cover object-top"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-col">
        <span className="text-sm font-bold text-slate-100">{stance.label}</span>
        <span className="text-sm text-gray-400">{stance.summary}</span>
      </div>
    </div>
  );
}

function ChatHistoryItem({ entry }: { entry: ChatHistoryEntry }) {
  const isUser = entry.speaker === "あなた" || entry.speaker === "User";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-slate-700">
        <img
          src={entry.avatar_url}
          alt=""
          className="h-full w-full object-cover object-top"
        />
      </div>
      <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
        <span className="mb-1 text-xs text-slate-400">{entry.speaker}</span>
        <div
          className={`rounded-2xl px-4 py-2 text-sm ${
            isUser
              ? "bg-emerald-600 text-white rounded-tr-sm"
              : "bg-slate-700 text-slate-100 rounded-tl-sm"
          }`}
        >
          {entry.text}
        </div>
      </div>
    </div>
  );
}

interface HeaderProps {
  theme: string;
  onOpenHistory?: () => void;
}

function Header({ theme, onOpenHistory }: HeaderProps) {
  return (
    <header className="relative border-b border-emerald-900/30 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-900/90 px-6 py-5 backdrop-blur-sm">
      {/* Top accent glow line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
      <div
        className="absolute inset-x-0 top-0 h-10 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 50% 100% at 50% 0%, rgba(251,191,36,0.12) 0%, transparent 100%)' }}
      />

      <div className="flex items-center gap-5">
        {/* Left ornament — Zelda-style golden serif label */}
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          <span className="h-px w-12 bg-gradient-to-r from-transparent to-amber-300/50" />
          <span
            className="select-none uppercase"
            style={{
              fontFamily: "'Noto Serif JP', 'Georgia', serif",
              fontSize: '1.15rem',
              fontWeight: 700,
              letterSpacing: '0.38em',
              color: 'rgba(251, 191, 36, 0.95)',
              textShadow: '0 0 22px rgba(251, 191, 36, 0.50), 0 0 50px rgba(251, 191, 36, 0.18)',
            }}
          >
            Agora
          </span>
          <span className="h-px w-8 bg-gradient-to-r from-amber-300/40 to-transparent" />
        </div>

        {/* Theme title */}
        <h1
          data-testid="header-theme"
          className="flex-1 text-center leading-snug"
          style={{
            fontFamily: "'Noto Serif JP', 'Georgia', serif",
            fontSize: 'clamp(1rem, 2vw, 1.4rem)',
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: '#e2e8f0',
            textShadow: '0 0 28px rgba(52, 211, 153, 0.18), 0 0 8px rgba(251, 191, 36, 0.08), 0 1px 2px rgba(0,0,0,0.5)',
          }}
        >
          {theme}
        </h1>

        {/* Right ornament */}
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          <span className="h-px w-8 bg-gradient-to-l from-amber-300/40 to-transparent" />
          <span
            className="select-none"
            style={{
              color: 'rgba(251, 191, 36, 0.70)',
              textShadow: '0 0 14px rgba(251, 191, 36, 0.30)',
              fontSize: '0.65rem',
            }}
          >
            ◆
          </span>
          <span className="h-px w-12 bg-gradient-to-l from-transparent to-amber-300/50" />
        </div>

        {/* History button — Sheikah-style */}
        <button
          type="button"
          onClick={onOpenHistory}
          disabled={!onOpenHistory}
          data-testid="open-history-button"
          className="shrink-0 group relative overflow-hidden rounded-sm px-4 py-1.5 text-xs font-medium tracking-wider uppercase transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            fontFamily: "'Noto Serif JP', 'Georgia', serif",
            border: '1px solid rgba(251, 191, 36, 0.40)',
            color: 'rgba(251, 191, 36, 0.90)',
            background: 'linear-gradient(180deg, rgba(251,191,36,0.08) 0%, rgba(251,191,36,0.02) 100%)',
            textShadow: '0 0 12px rgba(251, 191, 36, 0.25)',
            boxShadow: '0 0 16px rgba(251, 191, 36, 0.06)',
          }}
        >
          {/* Hover glow overlay */}
          <span
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(251,191,36,0.08) 0%, transparent 70%)',
              boxShadow: 'inset 0 0 12px rgba(251,191,36,0.06)',
            }}
          />
          <span className="relative">過去ログ</span>
        </button>
      </div>

      {/* Bottom accent line */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-300/40 to-transparent" />
    </header>
  );
}

interface PointsPanelProps {
  points: string[];
  focusPoint?: string;
}

function PointsPanel({ points, focusPoint = "" }: PointsPanelProps) {
  // 「props 由来の派生 state」パターン。points が変わった瞬間にだけ、直前のスナップ
  // ショットを `previousPoints` に退避して再描画する。マウント直後は previousPoints
  // = points なので「全てが NEW」扱いにならない（初回描画で過剰演出しない）。
  // React 19 の react-hooks/refs ルール対策で useRef ではなく useState を使う。
  const [renderedPoints, setRenderedPoints] = useState<string[]>(points);
  const [previousPoints, setPreviousPoints] = useState<string[]>(points);
  if (renderedPoints !== points) {
    setPreviousPoints(renderedPoints);
    setRenderedPoints(points);
  }

  const previousSet = new Set(previousPoints);
  const currentSet = new Set(points);
  const newItems = points.filter((p) => !previousSet.has(p));
  const removedItems = previousPoints.filter((p) => !currentSet.has(p));

  return (
    <aside
      data-testid="points-panel"
      className="w-56 shrink-0 rounded-xl p-4"
      style={{
        background: 'linear-gradient(160deg, rgba(15,30,26,0.85) 0%, rgba(10,22,40,0.80) 100%)',
        border: '1px solid rgba(52, 211, 153, 0.20)',
        boxShadow: '0 0 24px rgba(52, 211, 153, 0.07), inset 0 0 20px rgba(52, 211, 153, 0.03)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-0.5 rounded-full"
            style={{ background: 'rgba(52,211,153,0.70)', boxShadow: '0 0 6px rgba(52,211,153,0.50)' }}
          />
          <h2
            className="text-xs uppercase tracking-widest"
            style={{
              color: 'rgba(110, 231, 183, 0.80)',
              textShadow: '0 0 8px rgba(52,211,153,0.25)',
              letterSpacing: '0.15em',
            }}
          >
            論点
          </h2>
        </div>
        <DiffBadge added={newItems.length} removed={removedItems.length} />
      </div>
      {/* Divider */}
      <div
        className="mb-3 h-px"
        style={{ background: 'linear-gradient(90deg, rgba(52,211,153,0.25) 0%, rgba(52,211,153,0.05) 100%)' }}
      />
      {points.length === 0 ? (
        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.50)' }}>まだ論点が出ていません</p>
      ) : (
        <ul data-testid="points-list" className="space-y-1.5">
          <AnimatePresence initial={false}>
            {points.map((p) => {
              const isNew = !previousSet.has(p);
              const isFocused = !isNew && p === focusPoint;
              return (
                <PointItem key={p} point={p} isNew={isNew} isFocused={isFocused} />
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </aside>
  );
}

interface PointItemProps {
  point: string;
  isNew: boolean;
  isFocused?: boolean;
}

function PointItem({ point, isNew, isFocused = false }: PointItemProps) {
  const isPresent = useIsPresent();
  return (
    <motion.li
      layout
      data-testid="points-item"
      data-state={isPresent ? (isNew ? "new" : "kept") : "removing"}
      initial={
        isNew
          ? {
              opacity: 0,
              x: -24,
              scale: 0.7,
              backgroundColor: POINTS_NEW_BG,
              boxShadow: POINTS_GLOW_BOX_SHADOW,
            }
          : false
      }
      animate={{
        opacity: 1,
        x: 0,
        scale: 1,
        backgroundColor: POINTS_KEPT_BG,
        boxShadow: POINTS_NO_BOX_SHADOW,
        transition: {
          opacity: { duration: POINTS_ENTER_DURATION, ease: "easeOut" },
          x: { duration: POINTS_ENTER_DURATION, ease: "easeOut" },
          // 新規は spring で「ポンッ」と入場
          scale: isNew
            ? { type: "spring", stiffness: 320, damping: 14 }
            : { duration: POINTS_ENTER_DURATION, ease: "easeOut" },
          backgroundColor: { duration: POINTS_GLOW_DURATION, ease: "easeOut" },
          boxShadow: { duration: POINTS_GLOW_DURATION, ease: "easeOut" },
        },
      }}
      exit={{
        opacity: 0,
        x: 32,
        scale: 0.92,
        transition: { duration: POINTS_EXIT_DURATION, ease: "easeIn" },
      }}
      className={`relative flex items-center gap-2 overflow-hidden rounded-lg px-3 py-2 text-sm ${
        isFocused && isPresent
          ? 'ring-1'
          : ''
      }`}
      style={{
        willChange: 'transform, opacity, box-shadow, background-color',
        ...(isFocused && isPresent ? {
          ringColor: 'rgba(52,211,153,0.60)',
          boxShadow: '0 0 10px rgba(52,211,153,0.18), inset 0 0 6px rgba(52,211,153,0.05)',
          border: '1px solid rgba(52,211,153,0.35)',
        } : {
          border: '1px solid transparent',
        }),
      }}
    >
      <span
        className={
          isPresent
            ? "flex-1 text-slate-100"
            : "flex-1 text-rose-200 line-through decoration-rose-400 decoration-2"
        }
      >
        {point}
      </span>
      {isNew && isPresent && <NewBadge />}
      {isFocused && isPresent && (
        <span
          data-testid="points-focus-badge"
          className="whitespace-nowrap rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300"
        >
          深掘り中
        </span>
      )}
    </motion.li>
  );
}

function NewBadge() {
  return (
    <motion.span
      data-testid="points-new-badge"
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{
        opacity: [0, 1, 1, 0],
        scale: [0.6, 1, 1, 0.9],
      }}
      transition={{
        duration: POINTS_NEW_HIGHLIGHT_DURATION,
        ease: "easeOut",
        times: [0, 0.1, 0.75, 1],
      }}
      className="rounded-full bg-emerald-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-900"
    >
      New
    </motion.span>
  );
}

interface DiffBadgeProps {
  added: number;
  removed: number;
}

function DiffBadge({ added, removed }: DiffBadgeProps) {
  if (added === 0 && removed === 0) return null;
  return (
    <motion.span
      key={`${added}-${removed}`}
      data-testid="points-diff-badge"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: [0, 1, 1, 0], y: [-4, 0, 0, -4] }}
      transition={{
        duration: POINTS_NEW_HIGHLIGHT_DURATION,
        ease: "easeOut",
        times: [0, 0.15, 0.75, 1],
      }}
      className="flex items-center gap-1 text-[10px] font-bold"
    >
      {added > 0 && <span className="text-emerald-300">+{added}</span>}
      {removed > 0 && <span className="text-rose-300">−{removed}</span>}
    </motion.span>
  );
}

interface CharactersRowProps {
  characters: DebateState["characters"];
  isActive: (name: string) => boolean;
  status: DebateStatus;
  userName: string;
  userAvatarUrl: string;
  emotion: string;
  agentThoughts?: Record<string, AgentThought>;
  isUserActive?: boolean;
}

function EmotionEffect({ emotion }: { emotion: string }) {
  if (emotion === "happy") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.5 }}
        animate={{ opacity: [0, 1, 0], y: -30, scale: 1.2 }}
        transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
        className="absolute top-2 left-1/2 -translate-x-1/2 text-5xl z-40 pointer-events-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
      >
        ✨
      </motion.div>
    );
  }
  if (emotion === "angry") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: [0, 1, 0], scale: 1.2 }}
        transition={{ repeat: Infinity, duration: 1.5, ease: "easeOut" }}
        className="absolute top-2 left-1/2 -translate-x-1/2 text-5xl z-40 pointer-events-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
      >
        💢
      </motion.div>
    );
  }
  if (emotion === "sad") {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: [0, 1, 0], y: 20 }}
        transition={{ repeat: Infinity, duration: 2, ease: "easeIn" }}
        className="absolute top-6 left-1/2 -translate-x-1/2 text-5xl z-40 pointer-events-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
      >
        💧
      </motion.div>
    );
  }
  if (emotion === "surprised") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.5 }}
        animate={{ opacity: [0, 1, 0], y: -20, scale: 1.5 }}
        transition={{ repeat: Infinity, duration: 1, ease: "easeOut" }}
        className="absolute top-2 left-1/2 -translate-x-1/2 text-5xl text-yellow-400 font-bold z-40 pointer-events-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
      >
        ❗️
      </motion.div>
    );
  }
  if (emotion === "thinking") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: [0, 1, 0], y: -20 }}
        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        className="absolute top-2 left-1/2 -translate-x-1/2 text-5xl text-slate-200 font-bold z-40 pointer-events-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
      >
        ❓
      </motion.div>
    );
  }
  if (emotion === "confident") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8, rotate: -15 }}
        animate={{ opacity: [0, 1, 0], scale: 1.5, rotate: 15 }}
        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        className="absolute top-2 left-1/2 -translate-x-1/2 text-5xl z-40 pointer-events-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
      >
        🌟
      </motion.div>
    );
  }
  if (emotion === "confused") {
    return (
      <motion.div
        initial={{ opacity: 0, rotate: 0 }}
        animate={{ opacity: [0, 1, 0], rotate: 360 }}
        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
        className="absolute top-2 left-1/2 -translate-x-1/2 text-5xl z-40 pointer-events-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
      >
        🌀
      </motion.div>
    );
  }
  return null;
}

// 立ち絵サイズの命名定数（CONSTRAINTS.md: マジックナンバー禁止）。
// 縦幅統一方針: 立ち絵は全員ステージの h-full ぴったりの「同じ縦サイズ」で配置する。
// 画像は h-full w-auto + 絶対配置で、画像のアスペクト比に応じた自然な横幅で描画される。
// 列幅は flex-1 で均等分配（=横並びの基準点）するが、画像は列の幅に縛られず
// はみ出して隣のキャラと重なってよい（ユーザー要望: 横で重なるのは構わない）。
// shrink-0 のユーザー列が常に右端を確保するので、user 丸は画面外に出ない。
const STANDEE_MAX_COL_WIDTH = 360;
const USER_AVATAR_SIZE = "h-40 w-40";

function CharactersRow({
  characters,
  isActive,
  status,
  userName,
  userAvatarUrl,
  emotion,
  agentThoughts,
  isUserActive,
}: CharactersRowProps) {
  return (
    <div
      data-testid="stage-row"
      className="flex items-end justify-center gap-2 px-2 w-full h-full"
    >
      {/* min-w-0 を付けて flex-1 が確実に「親 - user 幅」内に収まるようにする */}
      <ul className="flex items-end justify-center gap-0 flex-1 min-w-0 h-full">
        {characters.map((c, i) => {
          const active = isActive(c.name);
          const thought = agentThoughts?.[c.name];
          const isWilling = thought?.willingness_to_speak;

          // 各列は flex-1 min-w-0 で「立ち位置」のスロットを均等に分配する。
          // 立ち絵自体は absolute + h-full w-auto で自然な縦長アスペクト比のまま
          // 縦幅を統一して描画される（列幅より広ければ隣にはみ出す）。
          return (
            <motion.li
              key={c.name}
              data-testid="stage-character"
              data-active={active ? "true" : "false"}
              initial={false}
              animate={active ? { y: [0, -22, 0] } : { y: 0 }}
              transition={
                active
                  ? { repeat: Infinity, duration: 2.5, ease: "easeInOut" }
                  : {}
              }
              className="relative flex flex-col items-center justify-end flex-1 min-w-0 h-full transition-all duration-300 ease-out"
              style={{
                zIndex: active ? 30 : 10 + i,
                filter: active ? "none" : "brightness(0.55) grayscale(0.25)",
                transform: active ? "scale(1.06)" : "scale(0.94)",
                maxWidth: `${STANDEE_MAX_COL_WIDTH}px`,
              }}
            >
              {active && <EmotionEffect emotion={emotion} />}

              {/* 発言意欲のインジケーター (T63) */}
              {status === "thinking" && isWilling && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="absolute right-0 top-1/4 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 shadow-lg z-40"
                  title="発言したい！"
                >
                  <span className="text-xl">✋</span>
                </motion.div>
              )}

              {/* 立ち絵描画ボックス: 列の中で 100% 高、絶対配置の img が中央下から立ち上がる */}
              <div className="relative w-full h-full overflow-visible"
                style={{
                  filter: active
                    ? 'drop-shadow(0 0 18px rgba(52,211,153,0.55)) drop-shadow(0 0 40px rgba(52,211,153,0.20))'
                    : 'none',
                }}
              >
                <img
                  src={c.avatar_url}
                  alt={c.name}
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 h-full w-auto max-w-none object-contain object-bottom select-none pointer-events-none"
                />
                {/* 足元のグロウ光 */}
                {active && (
                  <div
                    className="absolute -bottom-4 left-1/2 -translate-x-1/2 h-12 pointer-events-none"
                    style={{
                      width: '90%',
                      background: 'radial-gradient(ellipse at center, rgba(52,211,153,0.55) 0%, rgba(52,211,153,0.18) 40%, transparent 75%)',
                      filter: 'blur(6px)',
                    }}
                  />
                )}
              </div>
              {/* T5B: 立ち絵下のラベル（名前 / 発言中ステータス）はすべて非表示 */}
            </motion.li>
          );
        })}
      </ul>

      {/* User avatar is fixed at the far right. shrink-0 で潰れず、ml-* で並びから少し離す */}
      <div
        data-testid="stage-user"
        className={[
          "flex flex-col items-center relative z-20 shrink-0 ml-2 mb-44 transition-all duration-300 ease-out",
          isUserActive ? "scale-105" : "scale-95 opacity-80",
        ].join(" ")}
      >
        <div
          className={`${USER_AVATAR_SIZE} overflow-hidden rounded-full bg-slate-700 ring-4 ${isUserActive ? "ring-amber-300 shadow-[0_0_32px_rgba(251,191,36,0.5)]" : "ring-slate-600 shadow-none"}`}
        >
          <img
            src={userAvatarUrl}
            alt=""
            className="h-full w-full object-cover object-top"
          />
        </div>
        <div
          className={`mt-3 bg-slate-900/80 px-4 py-1 rounded-full border ${isUserActive ? "border-amber-500/50" : "border-slate-700"}`}
        >
          <p
            className={`text-sm font-semibold ${isUserActive ? "text-amber-200" : "text-slate-400"}`}
          >
            {userName}
          </p>
        </div>
        {isUserActive && (
          <span className="mt-1 text-[10px] text-amber-300 uppercase tracking-wider">
            {isUserActive && !isActive(userName)
              ? "入力中..."
              : status === "speaking"
                ? "発言中"
                : "待機中"}
          </span>
        )}
      </div>
    </div>
  );
}

interface TelopBoxProps {
  speaker: string;
  speech: string;
  hook?: string;
  body?: string;
  reasoningTarget?: string;
  concepts?: string[];
  moveType?: string;
  status: DebateStatus;
  intervention: InterventionKind | null;
  onCancel: () => void;
  onSubmit: (text: string) => void;
  userName?: string;
  agentThoughts?: Record<string, AgentThought>;
  // T69: TTS の話者プール選択用に発言者の gender を解決するため。
  characters: Character[];
  // T70: 親 (DebateStage) が保持する TTS プリフェッチキャッシュ参照。
  // 命中していれば Blob URL、未命中なら通常 `/api/tts` URL を返す。
  resolveTtsUrl: (
    speaker: string,
    speech: string,
    gender: Gender | undefined,
  ) => string;
}

function TelopBox({
  speaker,
  speech,
  hook = "",
  body = "",
  reasoningTarget = "",
  concepts = [],
  moveType = "",
  status,
  intervention,
  onCancel,
  onSubmit,
  userName = "あなた",
  agentThoughts,
  characters,
  resolveTtsUrl,
}: TelopBoxProps) {
  const empty = speech.trim().length === 0;
  const [draft, setDraft] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 音声再生ロジック
  useEffect(() => {
    // 既存の音声を停止
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
      setIsPlaying(false);
    }

    // AIの発言かつ発言が存在する場合のみ自動再生を試みる
    if (!empty && speaker && speaker !== USER_SPEAKER && speaker !== userName) {
      // T69: 発言者の gender を解決する。T70: think 中にプリフェッチ済みなら Blob URL、
      // 未命中なら通常 `/api/tts?...` URL（ネットワーク往復あり）が返る。
      const gender = characters.find((c) => c.name === speaker)?.gender;
      const url = resolveTtsUrl(speaker, speech, gender);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => setIsPlaying(false);
      audio.onpause = () => setIsPlaying(false);
      audio.onplay = () => setIsPlaying(true);

      audio.play().catch((err) => {
        console.error(
          "TTS autoplay failed (usually due to browser policy):",
          err,
        );
        setIsPlaying(false);
      });
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, [speech, speaker, userName, empty, characters, resolveTtsUrl]);

  const handlePlayClick = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } else {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(console.error);
      }
    }
  };

  const isUserSpeaker = speaker === USER_SPEAKER || speaker === userName;

  if (intervention) {
    const label = INTERVENTION_LABEL[intervention];
    return (
      <section
        data-testid="stage-telop"
        className="mx-auto mt-6 w-full max-w-3xl rounded-2xl border-2 border-amber-400 bg-slate-800/90 px-8 py-6 shadow-2xl"
      >
        <p
          data-testid="telop-speaker"
          className="mb-2 text-sm font-semibold text-amber-300"
        >
          {USER_SPEAKER}（{label}）
        </p>
        <textarea
          data-testid="intervention-input"
          autoFocus
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setDraft("");
              onCancel();
            } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSubmit(draft);
              setDraft("");
            }
          }}
          placeholder={`${label}を入力（Cmd/Ctrl+Enter で送信、Esc でキャンセル）`}
          className="w-full resize-none rounded-md border border-slate-600 bg-slate-900/60 px-4 py-3 text-lg leading-relaxed text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
        />
        <div className="mt-3 flex justify-end gap-3">
          <button
            type="button"
            data-testid="intervention-cancel"
            onClick={() => {
              setDraft("");
              onCancel();
            }}
            className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:border-slate-400 hover:text-slate-100"
          >
            キャンセル
          </button>
          <button
            type="button"
            data-testid="intervention-submit"
            disabled={draft.trim().length === 0}
            onClick={() => {
              onSubmit(draft);
              setDraft("");
            }}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-400"
          >
            送信
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      data-testid="stage-telop"
      className="mx-auto mt-6 w-full max-w-3xl rounded-2xl border-2 border-slate-600 bg-slate-800/90 px-8 py-6 shadow-2xl"
    >
      {empty ? (
        <div className="flex flex-col gap-1" data-testid="telop-empty">
          <p className="text-slate-400">
            {status === "thinking"
              ? Object.keys(agentThoughts || {}).length > 0
                ? "発言の準備が整いました"
                : "AIたちが思考中..."
              : "議論が始まるのを待っています..."}
          </p>
          {status === "thinking" &&
            Object.keys(agentThoughts || {}).length > 0 && (
              <p className="text-xs text-emerald-400 animate-pulse">
                「次へ」を押して議論を再開してください
              </p>
            )}
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            {speaker && (
              <p
                data-testid="telop-speaker"
                className="text-sm font-semibold text-emerald-300"
              >
                {speaker}
              </p>
            )}
            {/* 再生ボタン (ユーザー以外の場合) */}
            {!isUserSpeaker && speaker && (
              <button
                onClick={handlePlayClick}
                className="flex h-8 items-center justify-center rounded bg-slate-700/50 px-3 text-xs text-slate-300 hover:bg-slate-700 hover:text-emerald-300 transition-colors"
                title="音声を再生/停止"
              >
                {isPlaying ? (
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center justify-center gap-0.5 h-3">
                      <motion.div
                        className="w-[2px] bg-emerald-400 rounded-full"
                        animate={{ height: ["4px", "12px", "4px"] }}
                        transition={{
                          duration: 0.8,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      />
                      <motion.div
                        className="w-[2px] bg-emerald-400 rounded-full"
                        animate={{ height: ["8px", "16px", "8px"] }}
                        transition={{
                          duration: 0.8,
                          repeat: Infinity,
                          ease: "easeInOut",
                          delay: 0.2,
                        }}
                      />
                      <motion.div
                        className="w-[2px] bg-emerald-400 rounded-full"
                        animate={{ height: ["4px", "10px", "4px"] }}
                        transition={{
                          duration: 0.8,
                          repeat: Infinity,
                          ease: "easeInOut",
                          delay: 0.4,
                        }}
                      />
                    </div>
                    <span className="text-emerald-400">再生中</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                    </svg>
                    <span>音声を再生</span>
                  </div>
                )}
              </button>
            )}
          </div>
          {/* hook/body 構造があればタイプライター演出、無ければ speech を平文表示 (D18) */}
          {hook || body ? (
            <div data-testid="telop-speech" className="flex flex-col gap-1">
              {(reasoningTarget || (moveType && MOVE_TYPE_LABEL[moveType])) && (
                <p className="flex items-center gap-2 text-xs font-medium text-amber-300/80">
                  {moveType && MOVE_TYPE_LABEL[moveType] && (
                    <span
                      data-testid="telop-move-badge"
                      className="rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300"
                    >
                      {MOVE_TYPE_LABEL[moveType]}
                    </span>
                  )}
                  {reasoningTarget && (
                    <span data-testid="telop-reasoning">
                      → {reasoningTarget} へ
                    </span>
                  )}
                </p>
              )}
              {hook && (
                <p className="text-lg font-semibold leading-relaxed text-slate-50">
                  {hook}
                </p>
              )}
              {body && (
                <Typewriter
                  key={`${speaker}:${hook}:${body}`}
                  text={body}
                  concepts={concepts}
                  className="text-lg leading-relaxed text-slate-100"
                />
              )}
            </div>
          ) : (
            <p
              data-testid="telop-speech"
              className="text-lg leading-relaxed text-slate-100"
            >
              {speech}
            </p>
          )}
        </>
      )}
    </section>
  );
}

interface ActionBarProps {
  intervention: InterventionKind | null;
  onSelectIntervention: (kind: InterventionKind) => void;
  interventionEnabled: boolean;
  addCharacterEnabled: boolean;
  onOpenAddCharacter: () => void;
  summarizeEnabled: boolean;
  isSummarizing: boolean;
  onSummarize: () => void;
}

function ActionBar({
  intervention,
  onSelectIntervention,
  interventionEnabled,
  addCharacterEnabled,
  onOpenAddCharacter,
  summarizeEnabled,
  isSummarizing,
  onSummarize,
}: ActionBarProps) {
  const interventionButtonsDisabled =
    !interventionEnabled || intervention !== null;

  // 異議系ボタン（琥ⅺ色グループ）
  const interventionButton = (
    kind: InterventionKind,
    label: string,
    testId: string,
  ) => (
    <button
      type="button"
      data-testid={testId}
      onClick={() => onSelectIntervention(kind)}
      disabled={interventionButtonsDisabled}
      className="group relative rounded-md px-4 py-2 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-35"
      style={{
        border: '1px solid rgba(251, 191, 36, 0.35)',
        color: interventionButtonsDisabled ? 'rgba(251,191,36,0.4)' : 'rgba(251, 191, 36, 0.90)',
        background: 'rgba(251, 191, 36, 0.04)',
        boxShadow: interventionButtonsDisabled
          ? 'none'
          : '0 0 12px rgba(251,191,36,0.15), inset 0 0 8px rgba(251,191,36,0.04)',
        textShadow: '0 0 8px rgba(251,191,36,0.20)',
      }}
      onMouseEnter={(e) => {
        if (!interventionButtonsDisabled) {
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            '0 0 22px rgba(251,191,36,0.40), inset 0 0 14px rgba(251,191,36,0.10)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(251,191,36,0.70)';
        }
      }}
      onMouseLeave={(e) => {
        if (!interventionButtonsDisabled) {
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            '0 0 12px rgba(251,191,36,0.15), inset 0 0 8px rgba(251,191,36,0.04)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(251,191,36,0.35)';
        }
      }}
    >
      {label}
    </button>
  );

  return (
    <nav
      data-testid="action-bar"
      className="flex flex-wrap items-center justify-center gap-3 border-t pt-4"
      style={{ borderColor: 'rgba(52,211,153,0.15)' }}
    >
      {/* 人物追加：ヴァイオレット系 */}
      <button
        type="button"
        data-testid="action-add-character"
        onClick={onOpenAddCharacter}
        disabled={!addCharacterEnabled || intervention !== null}
        className="rounded-md px-4 py-2 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-35"
        style={{
          border: '1px solid rgba(167, 139, 250, 0.40)',
          color: (!addCharacterEnabled || intervention !== null) ? 'rgba(167,139,250,0.4)' : 'rgba(196, 181, 253, 0.90)',
          background: 'rgba(139, 92, 246, 0.05)',
          boxShadow: (!addCharacterEnabled || intervention !== null)
            ? 'none'
            : '0 0 14px rgba(139,92,246,0.20), inset 0 0 10px rgba(139,92,246,0.06)',
          textShadow: '0 0 8px rgba(167,139,250,0.25)',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLButtonElement;
          if (!el.disabled) {
            el.style.boxShadow = '0 0 24px rgba(139,92,246,0.45), inset 0 0 16px rgba(139,92,246,0.12)';
            el.style.borderColor = 'rgba(167,139,250,0.75)';
          }
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLButtonElement;
          if (!el.disabled) {
            el.style.boxShadow = '0 0 14px rgba(139,92,246,0.20), inset 0 0 10px rgba(139,92,246,0.06)';
            el.style.borderColor = 'rgba(167,139,250,0.40)';
          }
        }}
      >
        人物追加
      </button>

      {/* 異議系：琥ⅺ色グループ */}
      {interventionButton("objection", "異議を唱える", "action-objection")}
      {interventionButton("viewpoint", "観点追加", "action-viewpoint")}
      {interventionButton("question", "質問", "action-question")}

      {/* 議論を整理：エメラルド系 */}
      <button
        type="button"
        data-testid="action-summarize"
        onClick={onSummarize}
        disabled={!summarizeEnabled || intervention !== null || isSummarizing}
        className="rounded-md px-4 py-2 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-35"
        style={{
          border: '1px solid rgba(52, 211, 153, 0.40)',
          color: (!summarizeEnabled || intervention !== null || isSummarizing) ? 'rgba(52,211,153,0.4)' : 'rgba(110, 231, 183, 0.95)',
          background: 'rgba(52, 211, 153, 0.05)',
          boxShadow: (!summarizeEnabled || intervention !== null || isSummarizing)
            ? 'none'
            : '0 0 14px rgba(52,211,153,0.22), inset 0 0 10px rgba(52,211,153,0.06)',
          textShadow: '0 0 8px rgba(52,211,153,0.25)',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLButtonElement;
          if (!el.disabled) {
            el.style.boxShadow = '0 0 24px rgba(52,211,153,0.45), inset 0 0 16px rgba(52,211,153,0.12)';
            el.style.borderColor = 'rgba(52,211,153,0.75)';
          }
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLButtonElement;
          if (!el.disabled) {
            el.style.boxShadow = '0 0 14px rgba(52,211,153,0.22), inset 0 0 10px rgba(52,211,153,0.06)';
            el.style.borderColor = 'rgba(52,211,153,0.40)';
          }
        }}
      >
        {isSummarizing ? "整理中..." : "議論を整理する"}
      </button>
    </nav>
  );
}

interface AddCharacterModalProps {
  existingNames: string[];
  onClose: () => void;
  onCreated: (character: Character) => void | Promise<void>;
}

function AddCharacterModal({
  existingNames,
  onClose,
  onCreated,
}: AddCharacterModalProps) {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const isDuplicate = existingNames.includes(trimmed);
  const canSubmit = trimmed.length > 0 && !isDuplicate && !isSubmitting;

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const { avatar_url } = await addCharacter(trimmed);
      await onCreated({ name: trimmed, avatar_url });
    } catch (err) {
      console.error(err);
      setError("アバター生成に失敗しました。時間をおいて再試行してください。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-testid="add-character-modal"
      className="absolute inset-0 z-50 flex items-center justify-center"
    >
      <div
        data-testid="add-character-overlay"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-600 bg-slate-800 p-6 shadow-2xl">
        <h2 className="mb-1 text-lg font-semibold text-slate-100">
          人物を追加
        </h2>
        <p className="mb-4 text-xs text-slate-400">
          名前を入力すると、アバターを生成してステージに追加します。
        </p>
        <label
          htmlFor="add-character-name"
          className="mb-1 block text-xs font-semibold text-slate-300"
        >
          名前
        </label>
        <input
          id="add-character-name"
          data-testid="add-character-input"
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              if (!isSubmitting) onClose();
            } else if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          disabled={isSubmitting}
          placeholder="例: 織田信長"
          className="w-full rounded-md border border-slate-600 bg-slate-900/60 px-4 py-2 text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none disabled:opacity-60"
        />
        {isDuplicate && (
          <p
            data-testid="add-character-duplicate"
            className="mt-2 text-xs text-amber-300"
          >
            この名前は既にステージにいます。
          </p>
        )}
        {error && (
          <p
            data-testid="add-character-error"
            className="mt-2 text-xs text-rose-300"
          >
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            data-testid="add-character-cancel"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:border-slate-400 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            data-testid="add-character-submit"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-400"
          >
            {isSubmitting ? "生成中..." : "追加"}
          </button>
        </div>
      </div>
    </div>
  );
}

// SetupScreen の門の閉門演出と連続する「議会の幕開け」。
// マウント時に SetupScreen と同色の紺色パネルが画面を覆った状態で立ち上がり、
// 左右に開いて DebateStage を露わにする。完了後はノードを破棄して操作を妨げない。
const COUNCIL_GATE_OPEN_SECONDS = 1.1;
// マウント直後の「閉じた門」を視認できる長さ保持する（DebateStage の初描画チラつきも吸収）。
const COUNCIL_GATE_HOLD_MS = 280;
const COUNCIL_GATE_OPEN_EASE = [0.55, 0, 0.2, 1] as const;
const COUNCIL_GATE_DEEP_BLUE = "#1a2742";
const COUNCIL_GATE_DEEP_BLUE_DARK = "#0a1428";
const COUNCIL_GATE_GOLD = "#c9a96e";

function CouncilGateOpening() {
  const [mounted, setMounted] = useState(true);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // 閉じた門を一定時間ホールド → 開門 → 開門完了後にノード破棄。
    // onAnimationComplete を使うと「initial==animate」の no-op 時にも即発火し、
    // mounted が即時 false になってしまうので setTimeout で明示的に管理する。
    const openTimer = window.setTimeout(
      () => setOpen(true),
      COUNCIL_GATE_HOLD_MS,
    );
    const unmountTimer = window.setTimeout(
      () => setMounted(false),
      COUNCIL_GATE_HOLD_MS + COUNCIL_GATE_OPEN_SECONDS * 1000,
    );
    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(unmountTimer);
    };
  }, []);
  if (!mounted) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[80]">
      <motion.div
        initial={{ x: 0 }}
        animate={{ x: open ? "-101%" : 0 }}
        transition={{
          duration: COUNCIL_GATE_OPEN_SECONDS,
          ease: COUNCIL_GATE_OPEN_EASE,
        }}
        className="absolute inset-y-0 left-0 w-1/2"
        style={{
          background: `linear-gradient(135deg, ${COUNCIL_GATE_DEEP_BLUE} 0%, ${COUNCIL_GATE_DEEP_BLUE_DARK} 80%)`,
          boxShadow: "inset -24px 0 36px -16px rgba(0,0,0,0.55)",
        }}
      >
        <div
          className="absolute right-0 top-0 h-full w-px"
          style={{
            background: `linear-gradient(to bottom, transparent, ${COUNCIL_GATE_GOLD} 30%, ${COUNCIL_GATE_GOLD} 70%, transparent)`,
            boxShadow: `0 0 22px ${COUNCIL_GATE_GOLD}, 0 0 60px rgba(201,169,110,0.55)`,
          }}
        />
      </motion.div>
      <motion.div
        initial={{ x: 0 }}
        animate={{ x: open ? "101%" : 0 }}
        transition={{
          duration: COUNCIL_GATE_OPEN_SECONDS,
          ease: COUNCIL_GATE_OPEN_EASE,
        }}
        className="absolute inset-y-0 right-0 w-1/2"
        style={{
          background: `linear-gradient(225deg, ${COUNCIL_GATE_DEEP_BLUE} 0%, ${COUNCIL_GATE_DEEP_BLUE_DARK} 80%)`,
          boxShadow: "inset 24px 0 36px -16px rgba(0,0,0,0.55)",
        }}
      >
        <div
          className="absolute left-0 top-0 h-full w-px"
          style={{
            background: `linear-gradient(to bottom, transparent, ${COUNCIL_GATE_GOLD} 30%, ${COUNCIL_GATE_GOLD} 70%, transparent)`,
            boxShadow: `0 0 22px ${COUNCIL_GATE_GOLD}, 0 0 60px rgba(201,169,110,0.55)`,
          }}
        />
      </motion.div>
      {/* 中央の金光フラッシュ: 開門の瞬間に光が漏れる */}
      <motion.div
        initial={{ opacity: 0.55 }}
        animate={{ opacity: 0 }}
        transition={{
          duration: COUNCIL_GATE_OPEN_SECONDS * 0.7,
          ease: "easeOut",
        }}
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at center, rgba(255,222,138,0.55) 0%, transparent 55%)",
        }}
      />
    </div>
  );
}
