import { useState, useEffect, useCallback, useRef } from 'react';
import { Brain, Search, ChevronDown, ChevronUp, Clock, Tag, FolderOpen, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Memory {
  id: string;
  tier: string;
  content: string;
  tags: string[];
  related_files: string[];
  session_id?: string;
  project_path?: string;
  created_at: number;
  accessed_at: number;
  access_count: number;
  metadata?: Record<string, any>;
}

interface SearchResult {
  memory: Memory;
  score: number;
  relevance_score: number;
  recency_score: number;
  tier_score: number;
  proximity_score: number;
  frequency_score: number;
}

interface MemoriaStats {
  total_memories: number;
  by_tier: Record<string, number>;
  total_links: number;
  total_size_mb: number;
  oldest_memory: number;
  newest_memory: number;
}

interface RescueStats {
  total_memories: number;
  by_category: Record<string, number>;
}

interface CombinedStats {
  gaia: MemoriaStats;
  rescue: RescueStats | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIER_COLORS: Record<string, string> = {
  session: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  project: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  global: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  note: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  observation: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

const TIER_OPTIONS = ['all', 'session', 'project', 'global', 'note', 'observation'];
const SOURCE_OPTIONS = ['all', 'gaia', 'rescued'];
const LIMIT_OPTIONS = [10, 25, 50, 100];

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

function isRescued(memory: Memory): boolean {
  return memory.id.startsWith('rescue_') || (memory.tags ?? []).includes('rescued');
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatsCards({ stats, loading }: { stats: CombinedStats | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No memory database found. Memories are captured automatically during development.
      </div>
    );
  }

  const { gaia, rescue } = stats;
  const totalGaia = gaia.total_memories;
  const totalRescue = rescue?.total_memories ?? 0;
  const tiers = gaia.by_tier;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4">
      {/* Total Gaia */}
      <Card className="bg-card/50">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Gaia</span>
            <Brain className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <p className="text-2xl font-semibold mt-1 font-mono">{totalGaia.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-0.5">memories</p>
        </CardContent>
      </Card>

      {/* Rescued */}
      <Card className="bg-card/50">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Rescued</span>
            {rescue ? (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-400">
                dev-infra
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 opacity-50">
                N/A
              </Badge>
            )}
          </div>
          <p className="text-2xl font-semibold mt-1 font-mono">
            {rescue ? totalRescue.toLocaleString() : '--'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {rescue ? 'memories' : 'not installed'}
          </p>
        </CardContent>
      </Card>

      {/* By Tier (compact) */}
      <Card className="bg-card/50 col-span-2">
        <CardContent className="p-3">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">By Tier</span>
          <div className="flex flex-wrap gap-2 mt-2">
            {Object.entries(tiers).map(([tier, count]) => (
              <div key={tier} className="flex items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 ${TIER_COLORS[tier] ?? ''}`}
                >
                  {tier}
                </Badge>
                <span className="text-xs font-mono text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] text-muted-foreground">Sources:</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Gaia</Badge>
            {rescue && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-400">
                dev-infra
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MemoryCard({ result }: { result: SearchResult }) {
  const [expanded, setExpanded] = useState(false);
  const { memory, score } = result;
  const rescued = isRescued(memory);
  const truncateLen = 200;
  const needsTruncation = memory.content.length > truncateLen;
  const displayContent = expanded || !needsTruncation
    ? memory.content
    : memory.content.slice(0, truncateLen) + '...';

  return (
    <Card
      className={`bg-card/60 transition-colors hover:bg-card/80 ${
        rescued ? 'border-amber-500/25' : ''
      }`}
    >
      <CardContent className="p-3 space-y-2">
        {/* Top row: tier badge + source badge + time */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 ${TIER_COLORS[memory.tier] ?? TIER_COLORS.observation}`}
          >
            {memory.tier}
          </Badge>

          {rescued ? (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-400"
            >
              Rescued
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              Gaia
            </Badge>
          )}

          <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {relativeTime(memory.created_at)}
          </span>
        </div>

        {/* Content */}
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {displayContent}
        </p>

        {needsTruncation && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" /> Collapse
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" /> Expand
              </>
            )}
          </button>
        )}

        {/* Tags */}
        {memory.tags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Tag className="h-3 w-3 text-muted-foreground shrink-0" />
            {memory.tags
              .filter(t => t !== 'rescued') // don't double-show rescued tag
              .map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                  {tag}
                </Badge>
              ))}
          </div>
        )}

        {/* Project path */}
        {memory.project_path && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <FolderOpen className="h-3 w-3 shrink-0" />
            <span className="font-mono truncate">{memory.project_path}</span>
          </div>
        )}

        {/* Score bar */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-8 shrink-0">
            {(score * 100).toFixed(0)}%
          </span>
          <Progress value={score * 100} className="h-1" />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function MemoryExplorer() {
  const [stats, setStats] = useState<CombinedStats | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [query, setQuery] = useState('');
  const [tier, setTier] = useState('all');
  const [source, setSource] = useState('all');
  const [limit, setLimit] = useState(25);
  const [statsLoading, setStatsLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load stats once
  useEffect(() => {
    const loadStats = async () => {
      setStatsLoading(true);
      try {
        const res = await fetch('/api/memories/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch {
        // Stats unavailable
      } finally {
        setStatsLoading(false);
      }
    };
    loadStats();
  }, []);

  // Fetch results (search or recent)
  const fetchResults = useCallback(async (searchQuery: string, tierFilter: string, sourceFilter: string, resultLimit: number) => {
    setResultsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (tierFilter !== 'all') params.set('tier', tierFilter);
      if (sourceFilter !== 'all') params.set('source', sourceFilter);
      params.set('limit', String(resultLimit));

      const endpoint = searchQuery ? '/api/memories/search' : '/api/memories/recent';
      const res = await fetch(`${endpoint}?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    } finally {
      setResultsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchResults('', tier, source, limit);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search on query change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchResults(query, tier, source, limit);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, tier, source, limit, fetchResults]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Stats */}
      <StatsCards stats={stats} loading={statsLoading} />

      {/* Search bar */}
      <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search memories (FTS5)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>

        <Select value={tier} onValueChange={setTier}>
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue placeholder="Tier" />
          </SelectTrigger>
          <SelectContent>
            {TIER_OPTIONS.map((t) => (
              <SelectItem key={t} value={t} className="text-xs">
                {t === 'all' ? 'All Tiers' : t.charAt(0).toUpperCase() + t.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {s === 'all' ? 'All Sources' : s === 'gaia' ? 'Gaia Only' : 'Rescued Only'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
      </div>

      {/* Results */}
      <ScrollArea className="flex-1">
        <div className="px-4 pb-4 space-y-2">
          {resultsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Brain className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                No memories found.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Memories are captured automatically during development.
              </p>
            </div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground pb-1">
                {results.length} result{results.length !== 1 ? 's' : ''}
                {query && <span className="ml-1">for &ldquo;{query}&rdquo;</span>}
              </div>
              {results.map((result) => (
                <MemoryCard key={result.memory.id} result={result} />
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
