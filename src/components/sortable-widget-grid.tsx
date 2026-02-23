'use client';

import { type ReactNode, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { WidgetConfig, WidgetId } from '@/lib/dashboard/widgetRegistry';

/* ------------------------------------------------------------------ */
/*  SortableItem                                                       */
/* ------------------------------------------------------------------ */

function SortableItem({
  id,
  editMode,
  visible,
  children,
}: {
  id: string;
  editMode: boolean;
  visible: boolean;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : !visible && editMode ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  // In non-edit mode, hide invisible widgets entirely
  if (!visible && !editMode) return null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative ${
        editMode
          ? 'rounded-lg ring-1 ring-dashed ring-border'
          : ''
      } ${!visible && editMode ? 'pointer-events-none' : ''}`}
    >
      {editMode && (
        <div
          className="absolute -left-1 top-2 z-10 flex items-center justify-center w-7 h-7 rounded-md bg-muted border border-border cursor-grab active:cursor-grabbing shadow-sm"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} className="text-muted-foreground" />
        </div>
      )}
      <div className={editMode ? 'ml-6' : ''}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SortableWidgetGrid                                                 */
/* ------------------------------------------------------------------ */

interface SortableWidgetGridProps {
  layout: WidgetConfig[];
  onReorder: (newLayout: WidgetConfig[]) => void;
  renderWidget: (id: WidgetId) => ReactNode;
  editMode: boolean;
}

export function SortableWidgetGrid({
  layout,
  onReorder,
  renderWidget,
  editMode,
}: SortableWidgetGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = layout.findIndex((w) => w.id === active.id);
      const newIndex = layout.findIndex((w) => w.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const newLayout = arrayMove(layout, oldIndex, newIndex);
      onReorder(newLayout);
    },
    [layout, onReorder]
  );

  const ids = layout.map((w) => w.id);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-6">
          {layout.map((widget) => (
            <SortableItem
              key={widget.id}
              id={widget.id}
              editMode={editMode}
              visible={widget.visible}
            >
              {renderWidget(widget.id)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
