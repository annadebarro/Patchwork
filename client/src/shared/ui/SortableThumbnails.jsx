import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableThumb({ id, url, onDelete, canDelete, onCrop }) {
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
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="sortable-thumb" {...attributes} {...listeners}>
      <img src={url} alt="" />
      {onCrop && (
        <button
          type="button"
          className="sortable-thumb-crop"
          onClick={(e) => {
            e.stopPropagation();
            onCrop(id);
          }}
          title="Crop"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
            <path d="M6 2v14h14" />
            <path d="M18 22V8H4" />
          </svg>
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          className="sortable-thumb-delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(id);
          }}
        >
          &times;
        </button>
      )}
    </div>
  );
}

function SortableThumbnails({ items, onReorder, onDelete, onCrop, minItems = 1 }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  }

  const canDelete = items.length > minItems;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={horizontalListSortingStrategy}>
        <div className="sortable-thumbnails">
          {items.map((item) => (
            <SortableThumb
              key={item.id}
              id={item.id}
              url={item.url}
              onDelete={onDelete}
              canDelete={canDelete}
              onCrop={onCrop}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export default SortableThumbnails;
