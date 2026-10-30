/**
 * 对话定位（用户输入索引）。
 *
 * 对齐 Web 端 task-user-input-index：把任务的每一轮用户输入列成一份可跳转索引，
 * 点某一条会滚动到会话里对应的那条消息。移动端受屏幕尺寸限制，右侧只保留一个
 * 圆点缩略入口，点击后在底部面板展开完整列表。
 */
import React from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icons';
import { Scrim } from '@/components/ui';
import type { UserInputIndexEntry } from '@/messages/userInputIndex';
import { fontSize, radius, spacing, useTheme } from '@/theme';

const MAX_DOTS = 6;

function fmtClock(ts?: number): string {
  if (!ts) return '';
  const ms = ts > 1e17 ? ts / 1e6 : ts > 1e14 ? ts / 1e3 : ts > 1e11 ? ts : ts * 1e3;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 右侧圆点缩略入口：点状分布让用户一眼看出对话轮数。 */
export function UserInputIndexTrigger({ count, onPress }: { count: number; onPress: () => void }) {
  const t = useTheme();
  if (count === 0) return null;
  const dots = Math.min(count, MAX_DOTS);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`对话定位，共 ${count} 轮`}
      style={({ pressed }) => [
        styles.trigger,
        { backgroundColor: t.bg2, borderColor: t.line, opacity: pressed ? 0.7 : 0.92, ...t.shLift },
      ]}
    >
      {Array.from({ length: dots }, (_, i) => (
        <View
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: 99,
            backgroundColor: i === dots - 1 ? t.ac : t.tx3,
            opacity: i === dots - 1 ? 1 : 0.55,
          }}
        />
      ))}
      {count > MAX_DOTS ? (
        <Text style={{ color: t.tx3, fontSize: 9, fontWeight: '700', marginTop: 2 }}>{count}</Text>
      ) : null}
    </Pressable>
  );
}

/** 完整索引面板。 */
export function UserInputIndexSheet({
  visible,
  entries,
  activeId,
  loading,
  hasMore,
  jumping,
  onJump,
  onLoadMore,
  onScrollToBottom,
  onClose,
}: {
  visible: boolean;
  entries: UserInputIndexEntry[];
  activeId: string | null;
  loading: boolean;
  hasMore: boolean;
  jumping: boolean;
  onJump: (entry: UserInputIndexEntry) => void;
  onLoadMore: () => void;
  onScrollToBottom: () => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Scrim onPress={onClose} />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '72%',
          backgroundColor: t.bg2,
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderColor: t.line2,
          paddingBottom: insets.bottom + 10,
          ...t.shLift,
        }}
      >
        <View style={{ width: 38, height: 4, borderRadius: 99, backgroundColor: t.line2, alignSelf: 'center', marginTop: 10, marginBottom: 8 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 6 }}>
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: t.tx }}>对话定位</Text>
          <Text style={{ color: t.tx3, fontSize: fontSize.sm }}>{entries.length} 轮</Text>
        </View>
        {hasMore ? (
          <Pressable
            onPress={onLoadMore}
            disabled={loading}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 9,
              marginHorizontal: 14,
              marginBottom: 4,
              borderRadius: radius.sm,
              backgroundColor: t.bg3,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            {loading ? <ActivityIndicator size="small" color={t.tx3} /> : <Icons.refresh size={14} color={t.tx3} sw={2} />}
            <Text style={{ color: t.tx2, fontSize: fontSize.sm, fontWeight: '600' }}>加载更多</Text>
          </Pressable>
        ) : null}
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 6 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const on = item.id === activeId;
            return (
              <Pressable
                onPress={() => onJump(item)}
                disabled={jumping}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: on ? t.acGhost : 'transparent' },
                  (pressed || (jumping && on)) && { opacity: 0.6 },
                ]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: on ? t.acTx : t.tx, fontSize: fontSize.md, fontWeight: '600' }}>
                    {item.content || '（无文本）'}
                  </Text>
                  <Text style={{ color: t.tx3, fontSize: fontSize.xs, marginTop: 2 }}>{fmtClock(item.timestamp)}</Text>
                </View>
                <Icons.arrowRight size={14} color={t.tx3} sw={2} />
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text style={{ color: t.tx3, fontSize: fontSize.sm, textAlign: 'center', paddingVertical: 24 }}>暂无对话记录</Text>
          }
        />
        <Pressable
          onPress={onScrollToBottom}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 10,
            marginHorizontal: spacing.pad,
            marginTop: 4,
            borderRadius: radius.sm,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: t.line,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Icons.download size={14} color={t.tx2} sw={2} style={{ transform: [{ rotate: '180deg' }] }} />
          <Text style={{ color: t.tx2, fontSize: fontSize.sm, fontWeight: '600' }}>回到底部</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 34,
    paddingVertical: 9,
    borderRadius: 99,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
});
