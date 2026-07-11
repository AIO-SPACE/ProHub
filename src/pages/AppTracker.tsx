import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Star,
  GitFork,
  RefreshCw,
  ExternalLink,
  Clock,
  Search,
  Tag,
  Github,
  AlertTriangle,
  CheckCircle2,
  Download,
} from 'lucide-react';
import { api, type AppsPayload, type Repo } from '@/lib/api';

export default function AppTracker() {
  const [payload, setPayload] = useState<AppsPayload | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadRepos = async () => {
    try {
      setPayload(await api.apps.get());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load GitHub repositories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRepos();
  }, []);

  const repos = useMemo(() => payload?.repos || [], [payload?.repos]);
  const filteredRepos = useMemo(() => repos.filter((repo: Repo) =>
    `${repo.owner}/${repo.name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.description.toLowerCase().includes(searchQuery.toLowerCase())
  ), [repos, searchQuery]);

  return (
    <div className="space-y-5">
      {(error || (payload?.errors?.length || 0) > 0) && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-ph-error/10 border border-ph-error/20 rounded-xl p-3 flex items-center gap-3"
        >
          <AlertTriangle size={16} className="text-ph-error flex-shrink-0" />
          <span className="text-[12px] text-[#fafafa]">
            {error || `${payload?.errors?.length || 0} GitHub request failed. Check repository names or API rate limits.`}
          </span>
        </motion.div>
      )}
      {actionMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-ph-success/10 border border-ph-success/20 rounded-xl p-3 flex items-center gap-3"
        >
          <CheckCircle2 size={16} className="text-ph-success flex-shrink-0" />
          <span className="text-[12px] text-[#fafafa]">{actionMessage}</span>
        </motion.div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              setLoading(true);
              try {
                setPayload(await api.apps.checkAll());
                setError(null);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'GitHub check failed');
              } finally {
                setLoading(false);
              }
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-ph-indigo hover:bg-ph-indigo/90 text-white text-[12px] font-medium rounded-lg transition-colors"
          >
            <RefreshCw size={13} /> Check All
          </button>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-ph-muted">{repos.length} live repositories</span>
            <span className="w-1 h-1 rounded-full bg-[#71717a]" />
            <span className="text-ph-warning">GitHub API</span>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white/[0.04] rounded-lg px-3 py-2 border border-white/[0.06]">
          <Search size={13} className="text-[#71717a]" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search repositories..."
            className="bg-transparent text-[12px] text-[#fafafa] placeholder-[#71717a] outline-none w-48"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-40 bg-[#27272a] border border-white/[0.08] rounded-xl animate-pulse" />)}
        </div>
      ) : filteredRepos.length === 0 ? (
        <div className="bg-[#27272a] border border-white/[0.08] rounded-xl p-8 text-center">
          <Github size={28} className="text-ph-muted mx-auto mb-3" />
          <div className="text-[13px] font-semibold text-[#fafafa] mb-1">No live repositories loaded</div>
          <p className="text-[11px] text-ph-muted max-w-md mx-auto">
            Configure tracked repositories in backend settings and optionally add a GitHub token to avoid public API rate limits.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {filteredRepos.map((repo, i) => (
            <motion.div
              key={repo.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="bg-[#27272a] border border-white/[0.08] rounded-xl p-4 card-hover"
            >
              <div className="flex items-start justify-between mb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center">
                    <Github size={16} className="text-[#fafafa]" />
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-[#fafafa]">{repo.owner}/{repo.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: repo.languageColor || '#a1a1aa' }} />
                      <span className="text-[10px] text-ph-muted">{repo.language}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <div className="flex items-center gap-1 text-[11px] text-ph-muted">
                    <Star size={11} /> {repo.stars >= 1000 ? `${(repo.stars / 1000).toFixed(0)}k` : repo.stars}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-ph-muted ml-2">
                    <GitFork size={11} /> {repo.forks >= 1000 ? `${(repo.forks / 1000).toFixed(0)}k` : repo.forks}
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-ph-muted line-clamp-2 mb-3 leading-relaxed">{repo.description || 'No repository description.'}</p>

              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-ph-success/10 text-ph-success">
                  <Tag size={9} /> Current {repo.currentVersion}
                </span>
                <span className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${
                  repo.hasUpdate ? 'bg-ph-warning/10 text-ph-warning' : 'bg-white/[0.04] text-ph-muted'
                }`}>
                  Latest {repo.latestVersion}
                </span>
              </div>

              {!!repo.releaseAssets?.length && (
                <div className="mb-3 space-y-1.5">
                  {repo.releaseAssets.slice(0, 2).map(asset => (
                    <button
                      key={asset.id}
                      onClick={async () => {
                        setActionMessage(null);
                        setError(null);
                        try {
                          await api.downloads.add(asset.browserDownloadUrl);
                          setActionMessage(`Added release asset to Downloads: ${asset.name}`);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Could not add release asset');
                        }
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-left transition-colors"
                    >
                      <Download size={11} className="text-ph-indigo flex-shrink-0" />
                      <span className="text-[10px] text-[#d4d4d8] truncate">{asset.name}</span>
                      <span className="ml-auto text-[10px] text-[#71717a]">{asset.downloadCount} dl</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.06]">
                <div className="flex items-center gap-1.5 text-[10px] text-[#71717a]">
                  <Clock size={9} /> {repo.lastChecked}
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={11} className="text-ph-success" />
                  <a
                    href={repo.url || `https://github.com/${repo.owner}/${repo.name}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 rounded hover:bg-white/[0.06] text-[#71717a] hover:text-[#fafafa] transition-colors"
                  >
                    <ExternalLink size={11} />
                  </a>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <div className="bg-[#27272a] border border-white/[0.08] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 size={14} className="text-ph-success" />
          <span className="text-[13px] font-medium text-[#fafafa]">Update History</span>
        </div>
        {payload?.updateHistory.length ? (
          <div className="space-y-2">
            {payload.updateHistory.map((entry, i) => (
              <div key={`${entry.repo}-${i}`} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                <div className="w-7 h-7 rounded-lg bg-ph-success/10 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 size={13} className="text-ph-success" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[12px] text-[#d4d4d8]">{entry.repo}</span>
                  <span className="text-[10px] text-ph-muted ml-2">{entry.from} &rarr; {entry.to}</span>
                </div>
                <span className="text-[10px] text-[#71717a] flex-shrink-0">{entry.date}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-ph-muted">No update actions have been taken in ProHub yet.</div>
        )}
      </div>
    </div>
  );
}
