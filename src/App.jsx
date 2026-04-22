import React, { useState, useRef, useEffect } from "react";

let sectionIdCounter = 1;
let taskIdCounter = 1;

const EDGE_GAP = 20;

function snapWidth(rawW) {
  return Math.max(200, rawW);
}

function snapHeight(rawH) {
  return Math.max(200, rawH);
}

function createSection(name, x = 100, y = 100) {
  return {
    id: sectionIdCounter++,
    name,
    x,
    y,
    width: snapWidth(220),
    height: snapHeight(300)
  };
}

function createTask(title, x, y) {
  return {
    id: taskIdCounter++,
    title,
    x,
    y,
    completed: false,
    highlighted: false
  };
}

export default function App() {
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const containerRef = useRef(null);

  const [sections, setSections] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [links, setLinks] = useState([]);
  const [linkStart, setLinkStart] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const linkStartRef = useRef(null);

  const dragRef = useRef(null);
  const undoRef = useRef([]);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem("taskboard");

    if (saved) {
      const data = JSON.parse(saved);

      setSections(data.sections || []);
      setTasks(data.tasks || []);
      setLinks(data.links || []);

      sectionIdCounter = Math.max(1, ...(data.sections || []).map(s => s.id + 1));
      taskIdCounter = Math.max(1, ...(data.tasks || []).map(t => t.id + 1));

      // delay enabling save until AFTER state is applied
      setTimeout(() => {
        hasLoadedRef.current = true;
      }, 0);

      return;
    }

    // no saved data
    setSections([]);
    setTasks([]);
    setLinks([]);

    setTimeout(() => {
      hasLoadedRef.current = true;
    }, 0);
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) return;

    localStorage.setItem("taskboard", JSON.stringify({ sections, tasks, links }));
  }, [sections, tasks, links]);

  useEffect(() => {
    function handleKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        const last = undoRef.current.pop();
        if (!last) return;
        setTasks(last.tasks);
        setLinks(last.links);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  function startDragTask(e, task) {
    // Shift+click = highlight only (no drag, no linking)
    if (e.shiftKey) {
      e.stopPropagation();
      e.preventDefault();
      setTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, highlighted: !t.highlighted } : t
      ));
      return;
    }
    e.stopPropagation();
    e.preventDefault();

    const rect = containerRef.current.getBoundingClientRect();

    const startX = e.clientX;
    const startY = e.clientY;

    let initialX = task.x;
    let initialY = task.y;

    if (task.y === 20) {
      initialX = e.clientX - rect.left - 80;
      initialY = e.clientY - rect.top - 20;

      setTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, x: initialX, y: initialY } : t
      ));
    }

    dragRef.current = {
      taskId: task.id,
      startX,
      startY,
      offsetX: e.clientX - (rect.left + initialX),
      offsetY: e.clientY - (rect.top + initialY),
      moved: false
    };

    function move(ev) {
      const d = dragRef.current;
      if (!d) return;

      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;

      if (!d.moved) {
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
          d.moved = true;
        } else {
          return;
        }
      }

      const rect = containerRef.current.getBoundingClientRect();
      const nx = ev.clientX - rect.left - d.offsetX;
      const ny = ev.clientY - rect.top - d.offsetY;

      setTasks(prev =>
        prev.map(t => (t.id === d.taskId ? { ...t, x: nx, y: ny } : t))
      );
    }

    function up() {
      const d = dragRef.current;
      dragRef.current = null;

      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);

      if (!d) return;

      if (!d.moved) {
        handleTaskClick(task.id);
      }
    }

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function handleTaskClick(taskId) {
    const currentStart = linkStartRef.current;

    if (!currentStart) {
      const next = { taskId };
      linkStartRef.current = next;
      setLinkStart(next);
      return;
    }

    if (currentStart.taskId !== taskId) {
      setLinks(prev => [...prev, { from: currentStart.taskId, to: taskId }]);
    }

    linkStartRef.current = null;
    setLinkStart(null);
  }

  function deleteLink(index) {
    undoRef.current.push({ tasks, links });
    setLinks(prev => prev.filter((_, i) => i !== index));
  }

  function deleteTask(taskId) {
    undoRef.current.push({ tasks, links });
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setLinks(prev => prev.filter(l => l.from !== taskId && l.to !== taskId));
  }

  function completeTask(taskId) {
    const blockers = links.filter(l => l.to === taskId).map(l => l.from);

    const hasIncompleteDeps = blockers.some(id => tasks.some(t => t.id === id));

    if (hasIncompleteDeps) return;

    undoRef.current.push({ tasks, links });

    setTasks(prev => prev.filter(t => t.id !== taskId));
    setLinks(prev => prev.filter(l => l.from !== taskId && l.to !== taskId));
  }

  function getCenter(task) {
    const w = 160;
    const h = 40;
    return {
      x: task.x + w / 2,
      y: task.y + h / 2
    };
  }

  function startDragSection(e, sec) {
    if (e.target.closest("button")) return;
    if (e.target.tagName === "INPUT") return;

    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = { x: sec.x, y: sec.y };

    function move(ev) {
      const rect = containerRef.current.getBoundingClientRect();

      setSections(prev => {
        const current = prev.find(s => s.id === sec.id);
        if (!current) return prev;

        let nx = startPos.x + (ev.clientX - startX);
        let ny = startPos.y + (ev.clientY - startY);

        nx = Math.max(EDGE_GAP, Math.min(rect.width - current.width - EDGE_GAP, nx));
        ny = Math.max(EDGE_GAP, Math.min(rect.height - current.height - EDGE_GAP, ny));

        const overlaps = (x, y) =>
          prev.some(other => {
            if (other.id === current.id) return false;
            return !(
              x + current.width + EDGE_GAP <= other.x ||
              x >= other.x + other.width + EDGE_GAP ||
              y + current.height + EDGE_GAP <= other.y ||
              y >= other.y + other.height + EDGE_GAP
            );
          });

        if (!overlaps(nx, ny)) {
          return prev.map(s => (s.id === current.id ? { ...s, x: nx, y: ny } : s));
        }

        if (!overlaps(nx, current.y)) {
          return prev.map(s => (s.id === current.id ? { ...s, x: nx } : s));
        }

        if (!overlaps(current.x, ny)) {
          return prev.map(s => (s.id === current.id ? { ...s, y: ny } : s));
        }

        return prev;
      });
    }

    function up() {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    }

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function startResizeSection(e, sec, dir) {
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const start = { ...sec };

    function overlaps(x, y, w, h, current, all) {
      return all.some(other => {
        if (other.id === current.id) return false;
        return !(
          x + w + EDGE_GAP <= other.x ||
          x >= other.x + other.width + EDGE_GAP ||
          y + h + EDGE_GAP <= other.y ||
          y >= other.y + other.height + EDGE_GAP
        );
      });
    }

    function move(ev) {
      const rect = containerRef.current.getBoundingClientRect();

      setSections(prev => {
        const current = prev.find(s => s.id === sec.id);
        if (!current) return prev;

        let nx = start.x;
        let ny = start.y;
        let nw = start.width;
        let nh = start.height;

        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        if (dir.includes("right")) nw = snapWidth(start.width + dx);
        if (dir.includes("left")) {
          nw = snapWidth(start.width - dx);
          nx = start.x + dx;
        }

        if (dir.includes("bottom")) nh = snapHeight(start.height + dy);
        if (dir.includes("top")) {
          nh = snapHeight(start.height - dy);
          ny = start.y + dy;
        }

        nw = Math.min(nw, rect.width - nx - EDGE_GAP);
        nh = Math.min(nh, rect.height - ny - EDGE_GAP);
        nx = Math.max(EDGE_GAP, nx);
        ny = Math.max(EDGE_GAP, ny);

        const tryResize = (x, y, w, h) => !overlaps(x, y, w, h, current, prev);

        if (tryResize(nx, ny, nw, nh)) {
          return prev.map(s =>
            s.id === current.id ? { ...s, x: nx, y: ny, width: nw, height: nh } : s
          );
        }

        if (tryResize(current.x, current.y, nw, current.height)) {
          return prev.map(s => (s.id === current.id ? { ...s, width: nw } : s));
        }

        if (tryResize(current.x, current.y, current.width, nh)) {
          return prev.map(s => (s.id === current.id ? { ...s, height: nh } : s));
        }

        return prev;
      });
    }

    function up() {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    }

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function addSectionAt(x, y) {
    const rect = containerRef.current.getBoundingClientRect();

    const width = snapWidth(220);
    const height = snapHeight(300);

    let baseX = Math.max(EDGE_GAP, Math.min(rect.width - width - EDGE_GAP, x));
    let baseY = Math.max(EDGE_GAP, Math.min(rect.height - height - EDGE_GAP, y));

    setSections(prev => [...prev, createSection("New Section", baseX, baseY)]);
  }

  function deleteSection(id) {
    setSections(prev => prev.filter(s => s.id !== id));
  }

  function addTask() {
    if (!newTaskTitle.trim()) return;

    const stagingY = 20;
    const TASK_W = 160;
    const GAP = 8;

    // shift existing staging tasks left by one slot
    setTasks(prev => {
      const shifted = prev.map(t => {
        if (t.y !== stagingY) return t;
        return { ...t, x: t.x - (TASK_W + GAP) };
      });

      // place new task closest to input (rightmost = x: 0)
      return [...shifted, createTask(newTaskTitle, 0, stagingY)];
    });

    setNewTaskTitle("");
  }

  function handleTaskInputKey(e) {
    if (e.key === "Enter") addTask();
  }

  const fromIds = new Set(links.map(l => l.from));
  const toIds = new Set(links.map(l => l.to));

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-2 h-[70px]">
        <div className="flex gap-2 flex-1 justify-end">
          {tasks.filter(t => t.y === 20).map(task => (
            <div
              key={task.id}
              onMouseDown={e => startDragTask(e, task)}
              onDoubleClick={() => completeTask(task.id)}
              onContextMenu={(e) => { e.preventDefault(); deleteTask(task.id); }}
              className={`${task.highlighted ? "bg-yellow-200" : toIds.has(task.id) ? "bg-gray-200" : fromIds.has(task.id) ? "bg-green-300" : "bg-green-200"} p-2 rounded shadow text-sm cursor-move select-none`}
              style={{ width: 160 }}
            >
              {task.title}
            </div>
          ))}
        </div>
        <input
          value={newTaskTitle}
          onChange={e => setNewTaskTitle(e.target.value)}
          onKeyDown={handleTaskInputKey}
          placeholder="New task"
          className="border px-2 py-1 text-sm"
        />
        <button onClick={addTask} className="border px-2 py-1 text-sm bg-gray-100">Add</button>
      </div>

      <div
        ref={containerRef}
        className="relative h-[700px] border"
        onMouseMove={e => {
          const rect = containerRef.current.getBoundingClientRect();
          setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
        onDoubleClick={e => {
          if (e.target !== containerRef.current) return;
          const rect = containerRef.current.getBoundingClientRect();
          addSectionAt(e.clientX - rect.left, e.clientY - rect.top);
        }}
      >
        <svg className="absolute inset-0 pointer-events-none z-10" width="100%" height="100%">
          {links.map((l, i) => {
            const t1 = tasks.find(t => t.id === l.from);
            const t2 = tasks.find(t => t.id === l.to);
            if (!t1 || !t2) return null;
            const p1 = getCenter(t1);
            const p2 = getCenter(t2);
            return (
              <g key={i}>
              <line
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="transparent"
                strokeWidth={12}
                style={{ pointerEvents: "stroke" }}
                onContextMenu={(e) => { e.preventDefault(); deleteLink(i); }}
              />
              <line
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="black"
                strokeWidth={1}
                pointerEvents="none"
              />
            </g>
            );
          })}
        </svg>

        <svg className="absolute inset-0 pointer-events-none z-30" width="100%" height="100%">
          {linkStart && (() => {
            const t = tasks.find(t => t.id === linkStart.taskId);
            if (!t) return null;
            const p = getCenter(t);
            return (
              <line x1={p.x} y1={p.y} x2={mousePos.x} y2={mousePos.y} stroke="black" strokeDasharray="4" />
            );
          })()}
        </svg>

        {tasks.filter(t => t.y !== 20).map(task => (
          <div
            key={task.id}
            onMouseDown={e => startDragTask(e, task)}
            onDoubleClick={() => completeTask(task.id)}
            onContextMenu={(e) => { e.preventDefault(); deleteTask(task.id); }}
            className={`absolute ${task.highlighted ? "bg-yellow-200" : toIds.has(task.id) ? "bg-gray-200" : fromIds.has(task.id) ? "bg-green-300" : "bg-green-200"} p-2 rounded shadow text-sm cursor-move z-20 select-none`}
            style={{ left: task.x, top: task.y, width: 160 }}
          >
            {task.title}
          </div>
        ))}

        {sections.map(sec => (
          <div
            key={sec.id}
            className="absolute bg-gray-100 rounded-lg shadow z-0 border border-gray-300"
            style={{ left: sec.x, top: sec.y, width: sec.width, height: sec.height }}
          >
            <div className="flex justify-between p-2 font-bold relative z-20">
              <input
                value={sec.name}
                onChange={e =>
                  setSections(prev => prev.map(s => (s.id === sec.id ? { ...s, name: e.target.value } : s)))
                }
                className="bg-transparent w-full ml-[4px]"
              />
              <div className="flex items-center gap-2">
                <button onMouseDown={e => e.stopPropagation()} onClick={() => deleteSection(sec.id)}>
                  ✕
                </button>
                <span
                  className="text-lg cursor-move"
                  onMouseDown={e => {
                    e.stopPropagation();
                    startDragSection(e, sec);
                  }}
                >
                  ✥
                </span>
              </div>
            </div>

            <div onMouseDown={e => startResizeSection(e, sec, "right")} className="absolute right-0 top-0 h-full w-2 cursor-ew-resize" />
            <div onMouseDown={e => startResizeSection(e, sec, "left")} className="absolute left-0 top-0 h-full w-2 cursor-ew-resize" />
            <div onMouseDown={e => startResizeSection(e, sec, "bottom")} className="absolute bottom-0 left-0 w-full h-2 cursor-ns-resize" />
            <div onMouseDown={e => startResizeSection(e, sec, "top")} className="absolute top-0 left-0 w-full h-2 cursor-ns-resize" />

            <div onMouseDown={e => startResizeSection(e, sec, "top-left")} className="absolute left-0 top-0 w-3 h-3 cursor-nwse-resize" />
            <div onMouseDown={e => startResizeSection(e, sec, "top-right")} className="absolute right-0 top-0 w-3 h-3 cursor-nesw-resize" />
            <div onMouseDown={e => startResizeSection(e, sec, "bottom-left")} className="absolute left-0 bottom-0 w-3 h-3 cursor-nesw-resize" />
            <div onMouseDown={e => startResizeSection(e, sec, "bottom-right")} className="absolute right-0 bottom-0 w-3 h-3 cursor-nwse-resize" />
          </div>
        ))}
      </div>
    </div>
  );
}
