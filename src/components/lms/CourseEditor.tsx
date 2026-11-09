import React, { useEffect, useRef, useState } from 'react';
import { coursePath, isBuildSlug } from '../../lib/systems';
import ProgramPrices from './ProgramPrices';
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronRight, ExternalLink, FileUp, Plus, Trash2, X } from 'lucide-react';
import {
  DraftCourse,
  DraftLesson,
  DraftModule,
  PublishStatus,
  SessionType,
  emptyCourse,
  emptyLesson,
  emptyModule,
  errorMessage,
  loadDraftCourse,
  newClientId,
  saveCourse,
  slugify,
  uploadToolFile,
  formatBytes,
} from '../../lib/lms';
import { describeVideo } from '../../lib/lessonVideo';
import VideoSlot from '../VideoSlot';
import DualPrice from './DualPrice';
import { Button, CARD, Chip, Field, Loading, Notice, Select, TextArea, TextInput } from './lms-ui';

interface CourseEditorProps {
  key?: React.Key;
  /** undefined creates a new course */
  courseId?: string;
  canEdit: boolean;
  onClose: (changed: boolean) => void;
  openPath: (path: string) => void;
}

function move<T>(items: T[], from: number, to: number) {
  if (to < 0 || to >= items.length) return items;
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function CourseEditor({ courseId, canEdit, onClose, openPath }: CourseEditorProps) {
  const [draft, setDraft] = useState<DraftCourse | null>(courseId ? null : emptyCourse());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [dirty, setDirty] = useState(false);
  const [changed, setChanged] = useState(false);
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Uploads for a course that has not been saved yet go under a temporary folder.
  const uploadKey = useRef(courseId ?? `draft-${newClientId()}`);

  useEffect(() => {
    if (!courseId) return;
    loadDraftCourse(courseId)
      .then(setDraft)
      .catch((err) => setLoadError(errorMessage(err)));
  }, [courseId]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (loadError) return <Notice tone="error">We could not open this course: {loadError}</Notice>;
  if (!draft) return <Loading label="Opening course…" />;

  const update = (patch: Partial<DraftCourse>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
    setSavedAt(null);
  };
  const updateModule = (moduleIndex: number, patch: Partial<DraftModule>) =>
    update({ modules: draft.modules.map((module, i) => (i === moduleIndex ? { ...module, ...patch } : module)) });
  const updateLesson = (moduleIndex: number, lessonIndex: number, patch: Partial<DraftLesson>) =>
    updateModule(moduleIndex, {
      lessons: draft.modules[moduleIndex].lessons.map((lesson, i) => (i === lessonIndex ? { ...lesson, ...patch } : lesson)),
    });

  const handleSave = async () => {
    setSaveError(null);
    if (!draft.title.trim()) {
      setSaveError('Add a course title before saving.');
      return;
    }
    setSaving(true);
    try {
      const result = await saveCourse(draft);
      const fresh = await loadDraftCourse(result.id);
      setDraft(fresh);
      uploadKey.current = result.id;
      setDirty(false);
      setChanged(true);
      setSavedAt(new Date());
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) return;
    onClose(changed);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setSaveError(null);
    try {
      const added = [];
      for (const file of Array.from(files)) {
        const storagePath = await uploadToolFile(uploadKey.current, file);
        added.push({ clientId: newClientId(), name: file.name, storagePath, mimeType: file.type || null, sizeBytes: file.size });
      }
      update({ tools: [...draft.tools, ...added] });
    } catch (err) {
      setSaveError(`Upload failed: ${errorMessage(err)}`);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const [priceNote, setPriceNote] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const lessonCount = draft.modules.reduce((sum, module) => sum + module.lessons.length, 0);
  const priceMode = draft.priceMinor === null ? 'enrollment' : draft.priceMinor === 0 ? 'free' : 'paid';

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="sticky top-[65px] z-30 -mx-4 flex flex-wrap items-center gap-3 border-b border-[var(--pg-line-soft)] bg-[var(--pg-bg)]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <button onClick={handleClose} className="inline-flex items-center gap-2 text-[14px] text-[var(--pg-body)] hover:text-[var(--pg-ink)] cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> Products
        </button>
        <span className="font-editorial text-[18px] font-semibold">{draft.title || 'New product'}</span>
        <Chip tone={draft.status === 'Published' ? 'accent' : 'neutral'}>{draft.status}</Chip>
        <div className="ml-auto flex items-center gap-3">
          {savedAt && !dirty && <span className="text-[13px] text-[var(--pg-body)]">Saved</span>}
          {dirty && <span className="text-[13px] text-[var(--pg-body)]">Unsaved changes</span>}
          {draft.id && draft.status === 'Published' && (
            <Button variant="ghost" onClick={() => openPath(coursePath(draft.slug))}>
              <ExternalLink className="h-4 w-4" /> View
            </Button>
          )}
          {canEdit && (
            <Button onClick={handleSave} busy={saving} disabled={!dirty && !!draft.id}>
              Save product
            </Button>
          )}
        </div>
      </div>

      {!canEdit && <Notice>You have read-only access. Owners and coaches can edit courses.</Notice>}
      {saveError && <Notice tone="error">{saveError}</Notice>}

      <fieldset disabled={!canEdit} className="space-y-6">
        {/* Course details */}
        <section className={`${CARD} grid gap-5 p-6 sm:p-8 md:grid-cols-2`}>
          <Field
            label="Category"
            hint={draft.category === 'build' ? 'A guided build run as cohorts, joined through an application.' : draft.category === 'other' ? 'A product with no syllabus: details and an optional price only.' : 'Sessions and downloads, free, enrolled by the team or sold as a kit.'}
            className="md:col-span-2"
          >
            <Select
              value={draft.category}
              onChange={(e) => {
                const category = e.target.value as DraftCourse['category'];
                update({
                  category,
                  program: category === 'build' ? (draft.program === 'general' ? 'launchpad' : draft.program) : 'general',
                  ...(category === 'build' ? { priceMinor: null } : category === 'course' ? { priceMinor: 0, altPriceMinor: null } : {}),
                });
              }}
            >
              <option value="course">Course (free)</option>
              <option value="build">Build</option>
              <option value="other">Other (uncategorised)</option>
            </Select>
          </Field>
          <Field label="Title" className="md:col-span-2">
            <TextInput
              value={draft.title}
              onChange={(e) => update({ title: e.target.value, ...(draft.id ? {} : { slug: slugify(e.target.value) }) })}
              placeholder="e.g. Breadmaker Foundry"
            />
          </Field>
          <Field label="Subtitle" className="md:col-span-2">
            <TextInput value={draft.subtitle} onChange={(e) => update({ subtitle: e.target.value })} placeholder="One line on the outcome" />
          </Field>
          <Field label="Description" className="md:col-span-2">
            <TextArea rows={3} value={draft.description} onChange={(e) => update({ description: e.target.value })} />
          </Field>
          <Field
            label="Explainer video"
            hint="Shown on the course page beside enrollment. YouTube, Vimeo, Loom or a direct video file. Leave empty to use the free preview session's video."
            error={draft.explainerUrl.trim() && describeVideo(draft.explainerUrl).kind === 'unsupported' ? 'This link cannot be embedded.' : undefined}
            className="md:col-span-2"
          >
            <TextInput value={draft.explainerUrl} onChange={(e) => update({ explainerUrl: e.target.value })} placeholder="https://" />
          </Field>
          {describeVideo(draft.explainerUrl).kind !== 'none' && describeVideo(draft.explainerUrl).kind !== 'unsupported' && (
            <div className="max-w-[360px] md:col-span-2">
              <VideoSlot url={draft.explainerUrl} title={`About ${draft.title || 'this course'}`} compact />
            </div>
          )}
          <Field label="Who it is for">
            <TextInput value={draft.audience} onChange={(e) => update({ audience: e.target.value })} />
          </Field>
          <Field label="Web address" hint={draft.id ? 'Fixed once the course is saved.' : 'Filled in from the title.'}>
            <div className="flex items-center gap-2">
              <span className="text-[14px] text-[var(--pg-body)]">{draft.category === 'build' || isBuildSlug(draft.slug) ? '/build/' : '/course/'}</span>
              <TextInput value={draft.slug} disabled={!!draft.id} onChange={(e) => update({ slug: slugify(e.target.value) })} />
            </div>
          </Field>
          {draft.category === 'build' && (
          <Field label="Program">
            <Select value={draft.program} onChange={(e) => update({ program: e.target.value as DraftCourse['program'] })}>
              <option value="foundry">Breadmaker Foundry</option>
              <option value="launchpad">Breadmaker Launchpad</option>
              <option value="general">Other build</option>
            </Select>
          </Field>
          )}
          <Field label="Status" hint="Draft courses are only visible to the team.">
            <Select value={draft.status} onChange={(e) => update({ status: e.target.value as PublishStatus })}>
              <option value="Draft">Draft</option>
              <option value="Published">Published</option>
            </Select>
          </Field>
          {draft.category === 'course' && (
            <p className="text-[14.5px] leading-[1.55] text-[var(--pg-body)] md:col-span-2">Courses are free: anyone signed in can open them.</p>
          )}
          {draft.category === 'other' && (
          <Field label="Access">
            <Select
              value={priceMode}
              onChange={(e) => {
                const mode = e.target.value;
                update({ priceMinor: mode === 'enrollment' ? null : mode === 'free' ? 0 : draft.priceMinor || 100 });
              }}
            >
              <option value="enrollment">Enrollment only (team enrolls learners)</option>
              <option value="free">Free for anyone signed in</option>
              <option value="paid">Priced (shown on the course page)</option>
            </Select>
          </Field>
          )}
          {draft.category === 'other' && priceMode === 'paid' && (
            <DualPrice
              price={draft}
              hint="Shown to visitors in the currency they pick. Kits are paid for online; other courses are enrolled by the team."
              onChange={(next) =>
                update({ priceMinor: next.priceMinor || 1, currency: next.currency.toLowerCase(), altPriceMinor: next.altPriceMinor })
              }
            />
          )}
        </section>

        {draft.category !== 'other' && (<>
        {draft.id && (draft.slug === 'launchpad' || draft.slug === 'foundry') && (
          <div>
            {priceNote && <div className="mb-4"><Notice tone={priceNote.tone}>{priceNote.text}</Notice></div>}
            <ProgramPrices bare program={draft.slug} canEdit={canEdit} onMessage={(tone, text) => setPriceNote({ tone, text })} />
          </div>
        )}

        {/* Modules and lessons */}
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-editorial text-[26px] font-semibold">Weeks and sessions</h2>
            <span className="text-[13.5px] text-[var(--pg-body)]">{draft.modules.length} modules · {lessonCount} sessions</span>
          </div>

          <div className="space-y-5">
            {draft.modules.map((module, moduleIndex) => (
              <div key={module.clientId} className={`${CARD} p-5 sm:p-7`}>
                <div className="flex flex-wrap items-start gap-3">
                  <Field label={`Module ${moduleIndex + 1}`} className="min-w-[220px] flex-1">
                    <TextInput value={module.title} onChange={(e) => updateModule(moduleIndex, { title: e.target.value })} />
                  </Field>
                  <div className="flex gap-1 pt-7">
                    <IconButton label="Move module up" onClick={() => update({ modules: move(draft.modules, moduleIndex, moduleIndex - 1) })} disabled={moduleIndex === 0}>
                      <ArrowUp className="h-4 w-4" />
                    </IconButton>
                    <IconButton label="Move module down" onClick={() => update({ modules: move(draft.modules, moduleIndex, moduleIndex + 1) })} disabled={moduleIndex === draft.modules.length - 1}>
                      <ArrowDown className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      label="Delete module"
                      onClick={() => {
                        if (module.lessons.length && !window.confirm(`Delete "${module.title}" and its ${module.lessons.length} sessions? Learner progress on them is removed when you save.`)) return;
                        update({ modules: draft.modules.filter((_, i) => i !== moduleIndex) });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                </div>

                <Field label="Summary" className="mt-4">
                  <TextArea rows={2} value={module.summary} onChange={(e) => updateModule(moduleIndex, { summary: e.target.value })} />
                </Field>
                <Field label="Done when" hint="One item per line. Shown as the module's checklist." className="mt-4">
                  <TextArea
                    rows={Math.max(3, module.doneWhen.length + 1)}
                    value={module.doneWhen.join('\n')}
                    onChange={(e) => updateModule(moduleIndex, { doneWhen: e.target.value.split('\n') })}
                  />
                </Field>

                <ol className="mt-5 space-y-2">
                  {module.lessons.map((lesson, lessonIndex) => {
                    const expanded = openLesson === lesson.clientId;
                    const video = describeVideo(lesson.videoUrl);
                    return (
                      <li key={lesson.clientId} className="rounded-[12px] border border-[var(--pg-line)] bg-[var(--pg-bg)]">
                        <div className="flex items-center gap-2 px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => setOpenLesson(expanded ? null : lesson.clientId)}
                            className="flex flex-1 items-center gap-2 text-left text-[15px] font-medium cursor-pointer"
                            aria-expanded={expanded}
                          >
                            {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                            <span className="truncate">{lesson.title || 'Untitled session'}</span>
                          </button>
                          {lesson.isPreview && <Chip tone="accent">Preview</Chip>}
                          <Chip tone={lesson.status === 'Published' ? 'dark' : 'neutral'}>{lesson.status}</Chip>
                          <IconButton label="Move session up" onClick={() => updateModule(moduleIndex, { lessons: move(module.lessons, lessonIndex, lessonIndex - 1) })} disabled={lessonIndex === 0}>
                            <ArrowUp className="h-4 w-4" />
                          </IconButton>
                          <IconButton label="Move session down" onClick={() => updateModule(moduleIndex, { lessons: move(module.lessons, lessonIndex, lessonIndex + 1) })} disabled={lessonIndex === module.lessons.length - 1}>
                            <ArrowDown className="h-4 w-4" />
                          </IconButton>
                          <IconButton
                            label="Delete session"
                            onClick={() => {
                              if (lesson.id && !window.confirm(`Delete "${lesson.title}"? Learner progress on it is removed when you save.`)) return;
                              updateModule(moduleIndex, { lessons: module.lessons.filter((_, i) => i !== lessonIndex) });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        </div>

                        {expanded && (
                          <div className="grid gap-4 border-t border-[var(--pg-line-soft)] p-4 md:grid-cols-4">
                            <Field label="Title" className="md:col-span-4">
                              <TextInput value={lesson.title} onChange={(e) => updateLesson(moduleIndex, lessonIndex, { title: e.target.value })} />
                            </Field>
                            <Field label="Type">
                              <Select value={lesson.sessionType} onChange={(e) => updateLesson(moduleIndex, lessonIndex, { sessionType: e.target.value as SessionType })}>
                                <option value="lesson">Lesson</option>
                                <option value="live">Live session</option>
                                <option value="working">Working session</option>
                              </Select>
                            </Field>
                            <Field label="Minutes">
                              <TextInput
                                type="number"
                                min={1}
                                value={lesson.durationMinutes}
                                onChange={(e) => updateLesson(moduleIndex, lessonIndex, { durationMinutes: Math.max(1, Number(e.target.value) || 1) })}
                              />
                            </Field>
                            <Field label="Status">
                              <Select value={lesson.status} onChange={(e) => updateLesson(moduleIndex, lessonIndex, { status: e.target.value as PublishStatus })}>
                                <option value="Draft">Draft</option>
                                <option value="Published">Published</option>
                              </Select>
                            </Field>
                            <label className="flex items-center gap-2.5 pt-7 text-[14px] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={lesson.isPreview}
                                onChange={(e) => updateLesson(moduleIndex, lessonIndex, { isPreview: e.target.checked })}
                                className="h-4 w-4 accent-[var(--pg-accent)]"
                              />
                              Free preview
                            </label>
                            <Field
                              label="Video link"
                              hint="YouTube, Vimeo, Loom or a direct video file. Use the replay link for live sessions."
                              error={video.kind === 'unsupported' ? 'This link cannot be embedded.' : undefined}
                              className="md:col-span-4"
                            >
                              <TextInput value={lesson.videoUrl} onChange={(e) => updateLesson(moduleIndex, lessonIndex, { videoUrl: e.target.value })} placeholder="https://" />
                            </Field>
                            <Field label="Session notes" hint="Blank lines start a new paragraph; lines starting with - become bullets." className="md:col-span-4">
                              <TextArea rows={6} value={lesson.body} onChange={(e) => updateLesson(moduleIndex, lessonIndex, { body: e.target.value })} />
                            </Field>
                            <Field label="The one action" className="md:col-span-2">
                              <TextArea rows={3} value={lesson.action} onChange={(e) => updateLesson(moduleIndex, lessonIndex, { action: e.target.value })} />
                            </Field>
                            <Field label="Done when" className="md:col-span-2">
                              <TextArea rows={3} value={lesson.doneWhen} onChange={(e) => updateLesson(moduleIndex, lessonIndex, { doneWhen: e.target.value })} />
                            </Field>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
                <button
                  type="button"
                  onClick={() => {
                    const lesson = emptyLesson();
                    updateModule(moduleIndex, { lessons: [...module.lessons, lesson] });
                    setOpenLesson(lesson.clientId);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--pg-accent)] hover:underline cursor-pointer"
                >
                  <Plus className="h-4 w-4" /> Add session
                </button>
              </div>
            ))}
          </div>

          <Button variant="ghost" className="mt-5" onClick={() => update({ modules: [...draft.modules, emptyModule(draft.modules.length)] })}>
            <Plus className="h-4 w-4" /> Add module
          </Button>
        </section>

        {/* Downloads */}
        <section className={`${CARD} p-6 sm:p-8`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-editorial text-[24px] font-semibold">Downloads</h2>
              <p className="mt-1 text-[14px] text-[var(--pg-body)]">Templates, checklists and the starter kit. Only learners with access can download them.</p>
            </div>
            <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            <Button variant="ghost" busy={uploading} onClick={() => fileInput.current?.click()}>
              <FileUp className="h-4 w-4" /> Upload files
            </Button>
          </div>
          {draft.tools.length > 0 ? (
            <ul className="mt-5 divide-y divide-[var(--pg-line-soft)] border-y border-[var(--pg-line-soft)]">
              {draft.tools.map((tool, toolIndex) => (
                <li key={tool.clientId} className="flex items-center gap-3 py-3">
                  <TextInput
                    value={tool.name}
                    onChange={(e) => update({ tools: draft.tools.map((t, i) => (i === toolIndex ? { ...t, name: e.target.value } : t)) })}
                    className="flex-1"
                    aria-label="Download name"
                  />
                  <span className="w-20 text-right text-[13px] text-[var(--pg-body)]">{formatBytes(tool.sizeBytes ?? 0)}</span>
                  {!tool.id && <Chip>New</Chip>}
                  <IconButton label="Remove download" onClick={() => update({ tools: draft.tools.filter((_, i) => i !== toolIndex) })}>
                    <X className="h-4 w-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 text-[14.5px] text-[var(--pg-body)]">No downloads yet.</p>
          )}
        </section>
        </>)}
      </fieldset>
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-full p-2 text-[var(--pg-body)] transition-colors hover:bg-[var(--pg-alt)] hover:text-[var(--pg-ink)] disabled:opacity-30 cursor-pointer disabled:cursor-default"
    >
      {children}
    </button>
  );
}
