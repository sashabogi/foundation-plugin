import { FileCode, GitBranch, Package, Code2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import type { SnapshotMetadata } from '../types';

interface StatsProps {
  metadata: SnapshotMetadata | null;
}

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ReactNode;
}

function StatCard({ title, value, description, icon }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value.toLocaleString()}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function Stats({ metadata }: StatsProps) {
  if (!metadata) {
    return (
      <div className="p-4 text-muted-foreground text-sm">
        No snapshot loaded
      </div>
    );
  }

  const totalFiles = metadata.files.length;
  const totalLines = metadata.files.reduce((sum, f) => sum + f.lines, 0);
  const totalImports = metadata.imports.length;
  const totalSymbols = Object.keys(metadata.symbolIndex).length;

  // Group by extension
  const extensionCounts = new Map<string, { count: number; lines: number }>();
  for (const file of metadata.files) {
    const ext = file.extension || 'other';
    const existing = extensionCounts.get(ext) || { count: 0, lines: 0 };
    extensionCounts.set(ext, {
      count: existing.count + 1,
      lines: existing.lines + file.lines,
    });
  }

  const sortedExtensions = Array.from(extensionCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8);

  const maxExtensionCount = Math.max(...sortedExtensions.map(([, stats]) => stats.count));

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <StatCard
            title="Files"
            value={totalFiles}
            icon={<FileCode className="h-4 w-4" />}
          />
          <StatCard
            title="Lines"
            value={totalLines}
            icon={<Code2 className="h-4 w-4" />}
          />
          <StatCard
            title="Imports"
            value={totalImports}
            icon={<GitBranch className="h-4 w-4" />}
          />
          <StatCard
            title="Symbols"
            value={totalSymbols}
            icon={<Package className="h-4 w-4" />}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">File Types</CardTitle>
            <CardDescription>Distribution by extension</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sortedExtensions.map(([ext, stats]) => {
              const percentage = (stats.count / maxExtensionCount) * 100;
              return (
                <div key={ext} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono">.{ext}</span>
                    <span className="text-muted-foreground">
                      {stats.count} files
                    </span>
                  </div>
                  <Progress value={percentage} className="h-2" />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Exports</CardTitle>
            <CardDescription>Exported symbols across files</CardDescription>
          </CardHeader>
          <CardContent>
            {metadata.exports.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {metadata.exports.reduce((sum, e) => sum + e.symbols.length, 0).toLocaleString()} symbols exported across{' '}
                {metadata.exports.length} files
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No export data available (basic snapshot)
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
