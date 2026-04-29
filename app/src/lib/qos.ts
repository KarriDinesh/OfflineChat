/**
 * qos.ts — Priority queue + adaptive QoS
 * Priority: SOS(0) > System(1) > Normal(2)
 * Normal messages are batched at 2s intervals.
 * SOS messages bypass batching and send immediately.
 */

export type Priority = 0 | 1 | 2 // SOS | System | Normal

interface QueuedMessage {
  data: Uint8Array
  priority: Priority
  enqueued: number
}

type FlushFn = (batch: Uint8Array[]) => void

export interface QoSQueue {
  enqueue(data: Uint8Array, priority: Priority): void
  flushImmediate(): void
  start(): void
  stop(): void
}

export function createQoSQueue(onFlush: FlushFn): QoSQueue {
  const queues: [QueuedMessage[], QueuedMessage[], QueuedMessage[]] = [[], [], []]
  let timer: ReturnType<typeof setInterval> | null = null

  function flushPriority(priority: Priority): Uint8Array[] {
    const batch = queues[priority].map(q => q.data)
    queues[priority] = []
    return batch
  }

  return {
    enqueue(data, priority) {
      queues[priority].push({ data, priority, enqueued: Date.now() })
      // SOS and System: flush immediately
      if (priority <= 1) {
        const batch = [
          ...flushPriority(0),
          ...flushPriority(1),
        ]
        if (batch.length) onFlush(batch)
      }
    },

    flushImmediate() {
      const batch = [
        ...flushPriority(0),
        ...flushPriority(1),
        ...flushPriority(2),
      ]
      if (batch.length) onFlush(batch)
    },

    start() {
      if (timer) return
      // Normal messages batch every 2 seconds
      timer = setInterval(() => {
        const batch = flushPriority(2)
        if (batch.length) onFlush(batch)
      }, 2000)
    },

    stop() {
      if (timer) { clearInterval(timer); timer = null }
    },
  }
}
