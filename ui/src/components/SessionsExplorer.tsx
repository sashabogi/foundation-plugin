import { useState, useEffect, useCallback } from 'react';
import { Clock, FolderOpen, Wrench, FileCode, RefreshCw, History, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Session {
  id: string;
  content: string;
  tags: string[];
  project_path?: string;
  created_at: number;
  metadata?: Record<string, any>;
}

interface ParsedSession {
  id: string;
  timestamp: string;
  projectPath: string;
  duration: string;
  toolsUsed: string[];
  filesChanged: string[];
  rawContent: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (months > 0) return `${months}mo ago`;
  if (weeks > 0) return `${weeks}w ago`;
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

function parseSessionContent(session: Session): ParsedSession {
  const content = session.content;
  const lines = content.split('\n');

  let timestamp = '';
  let projectPath = session.project_path || '';
  let duration = '';
  let toolsUsed: string[] = [];
  let filesChanged: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // "Session checkpoint — 2026-03-22T10:30:00.000Z"
    const tsMatch = trimmed.match(/Session checkpoint\s*[—–-]\s*(.+)/);
    if (tsMatch) {
      timestamp = tsMatch[1].trim();
    }

    // "Project: /path/to/project"
    const projMatch = trimmed.match(/^Project:\s*(.+)/);
    if (projMatch) {
      projectPath = projMatch[1].trim();
    }

    // "Duration: ~5.2 min"
    const durMatch = trimmed.match(/^Duration:\s*(.+)/);
    if (durMatch) {
      duration = durMatch[1].trim();
    }

    // "Tools used: Edit, Write, Bash"
    const toolsMatch = trimmed.match(/^Tools used:\s*(.+)/);
    if (toolsMatch) {
      toolsUsed = toolsMatch[1].split(',').map(t => t.trim()).filter(Boolean);
    }

    // "Files changed: /path/file1.ts, /path/file2.ts"
    const filesMatch = trimmed.match(/^Files changed:\s*(.+)/);
    if (filesMatch) {
      filesChanged = filesMatch[1].split(',').map(f => f.trim()).filter(Boolean);
    }
  }

  return {
    id: session.id,
    timestamp,
    projectPath,
    duration,
    toolsUsed,
    filesChanged,
    rawContent: content,
    createdAt: session.created_at,
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOL_COLORS: Record<string, string> = {
  Edit: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  Write: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  Bash: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  Read: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  Grep: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  Glob: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  Task: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
};

const LIMIT_OPTIONS = [10, 20, 50];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SessionCard({ session }: { session: ParsedSession }) {
  const [showFiles, setShowFiles] = useState(false);
  const hasFiles = session.filesChanged.length > 0;
  const fileCount = session.filesChanged.length;
  const projectName = session.projectPath
    ? session.projectPath.split('/').filter(Boolean).pop() || session.projectPath
    : 'Unknown project';

  return (
    <div className="flex gap-3">
      {/* Timeline connector */}
      <div className="flex flex-col items-center shrink-0 pt-1">
        <div className="h-3 w-3 rounded-full bg-primary/80 border-2 border-background ring-2 ring-primary/20" />
        <div className="w-px flex-1 bg-border/60" />
      </div>

      {/* Card */}
      <Card className="flex-1 bg-card/60 transition-colors hover:bg-card/80 mb-2">
        <CardContent className="p-3 space-y-2">
          {/* Top row: time + duration */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {relativeTime(session.createdAt)}
            </span>

            {session.duration && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {session.duration}
              </Badge>
            )}

            {session.timestamp && (
              <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                {new Date(session.timestamp).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>

          {/* Project path */}
          {session.projectPath && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <FolderOpen className="h-3 w-3 shrink-0" />
              <span className="font-mono truncate" title={session.projectPath}>
                {projectName}
              </span>
            </div>
          )}

          {/* Tools used */}
          {session.toolsUsed.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Wrench className="h-3 w-3 text-muted-foreground shrink-0" />
              {session.toolsUsed.map((tool) => (
                <Badge
                  key={tool}
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 ${TOOL_COLORS[tool] ?? 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'}`}
                >
                  {tool}
                </Badge>
              ))}
            </div>
          )}

          {/* Files changed */}
          {hasFiles && (
            <div>
              <button
                onClick={() => setShowFiles(!showFiles)}
                className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <FileCode className="h-3 w-3 shrink-0" />
                <span>{fileCount} file{fileCount !== 1 ? 's' : ''} changed</span>
                {showFiles ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>

              {showFiles && (
                <div className="mt-1.5 pl-[18px] space-y-0.5">
                  {session.filesChanged.map((file) => (
                    <div
                      key={file}
                      className="text-[10px] text-muted-foreground font-mono truncate"
                      title={file}
                    >
                      {file}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SessionsExplorer() {
  const [sessions, setSessions] = useState<ParsedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [projectFilter, setProjectFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  const fetchSessions = useCallback(async (resultLimit: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(resultLimit));
      const res = await fetch(`/api/sessions?${params.toString()}`);
      if (res.ok) {
        const data: Session[] = await res.json();
        const parsed = data.map(parseSessionContent);
        setSessions(parsed);
      } else {
        setSessions([]);
      }
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchSessions(limit);
  }, [limit, fetchSessions]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchSessions(limit);
    setRefreshing(false);
  };

  // Extract unique project paths for filter
  const projectPaths = Array.from(
    new Set(sessions.map(s => s.projectPath).filter(Boolean))
  ).sort();

  // Apply project filter
  const filteredSessions = projectFilter === 'all'
    ? sessions
    : sessions.filter(s => s.projectPath === projectFilter);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-2 p-4 pb-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <History className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium">Session Checkpoints</span>
          {!loading && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {filteredSessions.length}
            </Badge>
          )}
        </div>

        {projectPaths.length > 1 && (
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="Filter by project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Projects</SelectItem>
              {projectPaths.map((p) => (
                <SelectItem key={p} value={p} className="text-xs">
                  {p.split('/').filter(Boolean).pop() || p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
          <SelectTrigger className="w-[80px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LIMIT_OPTIONS.map((l) => (
              <SelectItem key={l} value={String(l)} className="text-xs">
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Timeline */}
      <ScrollArea className="flex-1">
        <div className="px-4 pb-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center shrink-0 pt-1">
                    <Skeleton className="h-3 w-3 rounded-full" />
                    <Skeleton className="w-px flex-1 mt-1" />
                  </div>
                  <Skeleton className="flex-1 h-24 rounded-lg" />
                </div>
              ))}
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <History className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                No session checkpoints found.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Sessions are captured automatically at the end of each Claude Code session.
              </p>
            </div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground pb-2">
                {filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''}
                {projectFilter !== 'all' && (
                  <span className="ml-1">
                    in {projectFilter.split('/').filter(Boolean).pop()}
                  </span>
                )}
              </div>
              {filteredSessions.map((session) => (
                <SessionCard key={session.id} session={session} />
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
