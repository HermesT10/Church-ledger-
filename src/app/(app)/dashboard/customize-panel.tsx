'use client';

import { useCallback } from 'react';
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
import { GripVertical, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  WIDGET_META,
  DEFAULT_LAYOUT,
  type WidgetConfig,
} from '@/lib/dashboard/widgetRegistry';

/* ------------------------------------------------------------------ */
/*  Sortable row in the customize list                                 */
/* ------------------------------------------------------------------ */

function SortableRow({
  config,
  onToggle,
}: {
  config: WidgetConfig;
  onToggle: (id: string) => void;
}) {
  const meta = WIDGET_META.find((m) => m.id === config.id);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: config.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border bg-background px-3 py-3"
    >
      {/* Drag handle */}
      <div
        className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </div>

      {/* Label + description */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{meta?.label ?? config.id}</p>
        {meta?.description && (
          <p className="text-xs text-muted-foreground truncate">
            {meta.description}
          </p>
        )}
      </div>

      {/* Visibility toggle */}
      <Switch
        checked={config.visible}
        onCheckedChange={() => onToggle(config.id)}
        aria-label={`Toggle ${meta?.label ?? config.id}`}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CustomizePanel                                                     */
/* ------------------------------------------------------------------ */

interface CustomizePanelProps {
  layout: WidgetConfig[];
  onChange: (newLayout: WidgetConfig[]) => void;
}

export function CustomizePanel({ layout, onChange }: CustomizePanelProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
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

      onChange(arrayMove(layout, oldIndex, newIndex));
    },
    [layout, onChange]
  );

  const handleToggle = useCallback(
    (id: string) => {
      onChange(
        layout.map((w) =>
          w.id === id ? { ...w, visible: !w.visible } : w
        )
      );
    },
    [layout, onChange]
  );

  const handleReset = useCallback(() => {
    onChange(DEFAULT_LAYOUT.map((w) => ({ ...w })));
  }, [onChange]);

  const ids = layout.map((w) => w.id);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          Customize
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80 sm:w-96 overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>Customize Dashboard</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Drag to reorder widgets. Toggle switches to show or hide them.
          </p>
        </SheetHeader>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {layout.map((config) => (
                <SortableRow
                  key={config.id}
                  config={config}
                  onToggle={handleToggle}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="mt-6 pt-4 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="gap-1.5"
          >
            <RotateCcw size={14} />
            Reset to Default
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
