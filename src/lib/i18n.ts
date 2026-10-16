/** Bilingual UI strings. `bn` is the default interface language. */
import type { Locale } from "./types";

const dict = {
  brand: { bn: "গল্পঘর", en: "GolpoGhor" },
  tagline: {
    bn: "বাংলা ও ইংরেজিতে গল্প পড়ুন ও প্রকাশ করুন।",
    en: "Read and publish stories in Bangla and English.",
  },
  nav: {
    home: { bn: "হোম", en: "Home" },
    discover: { bn: "ঘুরে দেখুন", en: "Discover" },
    library: { bn: "লাইব্রেরি", en: "Library" },
    write: { bn: "লিখুন", en: "Write" },
    search: { bn: "খুঁজুন", en: "Search" },
    signIn: { bn: "সাইন ইন", en: "Sign in" },
    signOut: { bn: "সাইন আউট", en: "Sign out" },
    profile: { bn: "প্রোফাইল", en: "Profile" },
    settings: { bn: "সেটিংস", en: "Settings" },
    admin: { bn: "মডারেশন", en: "Moderation" },
  },
  home: {
    heroTitle: {
      bn: "যে গল্পগুলো ঘরের মতো লাগে।",
      en: "Stories that feel like home.",
    },
    heroSub: {
      bn: "বাংলাদেশের পাঠক ও লেখকদের জন্য বাংলা ও ইংরেজি গল্পের ঠিকানা।",
      en: "A home for Bangla and English fiction from Bangladesh's readers and writers.",
    },
    startReading: { bn: "পড়া শুরু করুন", en: "Start reading" },
    startWriting: { bn: "লেখা শুরু করুন", en: "Start writing" },
    featured: { bn: "নির্বাচিত গল্প", en: "Featured stories" },
    recentBn: { bn: "সাম্প্রতিক বাংলা গল্প", en: "Recent in Bangla" },
    recentEn: { bn: "সাম্প্রতিক ইংরেজি গল্প", en: "Recent in English" },
    viewAll: { bn: "সব দেখুন", en: "View all" },
  },
  story: {
    by: { bn: "লেখক", en: "by" },
    chapters: { bn: "অধ্যায়", en: "chapters" },
    chapter: { bn: "অধ্যায়", en: "Chapter" },
    ongoing: { bn: "চলমান", en: "Ongoing" },
    complete: { bn: "সমাপ্ত", en: "Complete" },
    draft: { bn: "খসড়া", en: "Draft" },
    hidden: { bn: "লুকানো", en: "Hidden" },
    unpublished: { bn: "অপ্রকাশিত", en: "Unpublished" },
    startReading: { bn: "পড়া শুরু করুন", en: "Start reading" },
    continueReading: { bn: "চালিয়ে পড়ুন", en: "Continue reading" },
    saveToLibrary: { bn: "লাইব্রেরিতে রাখুন", en: "Save to library" },
    saved: { bn: "সংরক্ষিত", en: "Saved" },
    follow: { bn: "অনুসরণ করুন", en: "Follow" },
    following: { bn: "অনুসরণ করছেন", en: "Following" },
    followers: { bn: "অনুসারী", en: "followers" },
    like: { bn: "ভালো লেগেছে", en: "Like" },
    liked: { bn: "ভালো লেগেছে ✓", en: "Liked ✓" },
    minRead: { bn: "মিনিট", en: "min read" },
    views: { bn: "ভিউ", en: "views" },
    publishedOn: { bn: "প্রকাশিত", en: "Published" },
    updatedOn: { bn: "হালনাগাদ", en: "Updated" },
    noChapters: {
      bn: "এখনো কোনো প্রকাশিত অধ্যায় নেই।",
      en: "No published chapters yet.",
    },
    report: { bn: "রিপোর্ট করুন", en: "Report" },
    contentNotice: { bn: "বিষয়বস্তু সতর্কতা", en: "Content notice" },
  },
  reader: {
    previous: { bn: "আগের অধ্যায়", en: "Previous chapter" },
    next: { bn: "পরের অধ্যায়", en: "Next chapter" },
    contents: { bn: "সূচি", en: "Contents" },
    fontSize: { bn: "অক্ষরের আকার", en: "Font size" },
    lineSpacing: { bn: "লাইনের ফাঁক", en: "Line spacing" },
    theme: { bn: "থিম", en: "Theme" },
    themeLight: { bn: "আলো", en: "Light" },
    themeSepia: { bn: "সেপিয়া", en: "Sepia" },
    themeDark: { bn: "অন্ধকার", en: "Dark" },
    endOfChapter: { bn: "অধ্যায় শেষ", en: "End of chapter" },
    storyEnd: {
      bn: "গল্প এখানেই শেষ। মতামত জানাতে ভুলবেন না।",
      en: "This is the end of the story. Let the author know what you thought.",
    },
  },
  comments: {
    title: { bn: "মন্তব্য", en: "Comments" },
    placeholder: {
      bn: "আপনার মতামত লিখুন…",
      en: "Share your thoughts…",
    },
    post: { bn: "পোস্ট করুন", en: "Post" },
    signInToComment: {
      bn: "মন্তব্য করতে সাইন ইন করুন।",
      en: "Sign in to join the discussion.",
    },
    empty: {
      bn: "এখনো কোনো মন্তব্য নেই। প্রথম মন্তব্যকারী হোন!",
      en: "No comments yet. Be the first!",
    },
    delete: { bn: "মুছুন", en: "Delete" },
    deleted: { bn: "মন্তব্যটি মুছে ফেলা হয়েছে।", en: "Comment deleted." },
  },
  library: {
    title: { bn: "আমার লাইব্রেরি", en: "My library" },
    readingList: { bn: "পড়ার তালিকা", en: "Reading list" },
    following: { bn: "অনুসৃত লেখক", en: "Followed authors" },
    inProgress: { bn: "চলমান পাঠ", en: "Continue reading" },
    empty: {
      bn: "এখনো কিছু সংরক্ষণ করেননি। ভালো লাগা গল্পগুলো এখানে জমা হবে।",
      en: "Nothing saved yet. Stories you save will live here.",
    },
    emptyFollowing: {
      bn: "এখনো কাউকে অনুসরণ করছেন না।",
      en: "You're not following anyone yet.",
    },
    resume: { bn: "চালিয়ে যান", en: "Resume" },
  },
  auth: {
    signInTitle: { bn: "স্বাগতম", en: "Welcome back" },
    signUpTitle: { bn: "অ্যাকাউন্ট খুলুন", en: "Create your account" },
    email: { bn: "ইমেইল", en: "Email" },
    password: { bn: "পাসওয়ার্ড", en: "Password" },
    username: { bn: "ইউজারনেম", en: "Username" },
    displayName: { bn: "প্রদর্শন নাম", en: "Display name" },
    signInCta: { bn: "সাইন ইন", en: "Sign in" },
    signUpCta: { bn: "অ্যাকাউন্ট খুলুন", en: "Sign up" },
    forgot: { bn: "পাসওয়ার্ড ভুলে গেছেন?", en: "Forgot password?" },
    resetTitle: { bn: "পাসওয়ার্ড রিসেট", en: "Reset password" },
    resetCta: { bn: "রিসেট লিংক পাঠান", en: "Send reset link" },
    resetSent: {
      bn: "রিসেট লিংক পাঠানো হয়েছে। ইমেইল চেক করুন।",
      en: "Reset link sent. Check your email.",
    },
    newPassword: { bn: "নতুন পাসওয়ার্ড", en: "New password" },
    setPasswordCta: { bn: "পাসওয়ার্ড সেট করুন", en: "Set password" },
    noAccount: { bn: "অ্যাকাউন্ট নেই?", en: "No account?" },
    haveAccount: { bn: "অ্যাকাউন্ট আছে?", en: "Already have an account?" },
    usernameHint: {
      bn: "শুধু ছোট হাতের অক্ষর, সংখ্যা ও আন্ডারস্কোর (৩–৩০)।",
      en: "Lowercase letters, numbers and underscores only (3–30).",
    },
    signUpSuccess: {
      bn: "অ্যাকাউন্ট তৈরি হয়েছে! সাইন ইন করুন।",
      en: "Account created! Please sign in.",
    },
    confirmEmail: {
      bn: "ইমেইলে পাঠানো লিংকে ক্লিক করে অ্যাকাউন্ট নিশ্চিত করুন।",
      en: "Click the link in your email to confirm your account.",
    },
  },
  write: {
    dashboard: { bn: "আমার লেখা", en: "My writing" },
    newStory: { bn: "নতুন গল্প", en: "New story" },
    myStories: { bn: "আমার গল্প", en: "My stories" },
    noStories: {
      bn: "এখনো কোনো গল্প লেখেননি। নতুন গল্প শুরু করুন!",
      en: "You haven't written anything yet. Start a new story!",
    },
    title: { bn: "শিরোনাম", en: "Title" },
    summary: { bn: "সারসংক্ষেপ", en: "Summary" },
    language: { bn: "ভাষা", en: "Language" },
    genre: { bn: "ধারা", en: "Genre" },
    tags: { bn: "ট্যাগ", en: "Tags" },
    tagsHint: { bn: "কমা দিয়ে আলাদা করুন", en: "Separate with commas" },
    coverImage: { bn: "প্রচ্ছদ ছবি", en: "Cover image" },
    contentNotice: { bn: "বিষয়বস্তু সতর্কতা (ঐচ্ছিক)", en: "Content notice (optional)" },
    save: { bn: "সংরক্ষণ", en: "Save" },
    createStory: { bn: "গল্প তৈরি করুন", en: "Create story" },
    editStory: { bn: "গল্প সম্পাদনা", en: "Edit story" },
    deleteStory: { bn: "গল্প মুছুন", en: "Delete story" },
    chapters: { bn: "অধ্যায়সমূহ", en: "Chapters" },
    newChapter: { bn: "নতুন অধ্যায়", en: "New chapter" },
    chapterTitle: { bn: "অধ্যায়ের শিরোনাম", en: "Chapter title" },
    saving: { bn: "সংরক্ষণ হচ্ছে…", en: "Saving…" },
    savedAt: { bn: "সংরক্ষিত", en: "Saved" },
    saveFailed: { bn: "সংরক্ষণ ব্যর্থ — পুনরায় চেষ্টা", en: "Save failed — retry" },
    unsavedChanges: {
      bn: "অসংরক্ষিত পরিবর্তন আছে।",
      en: "You have unsaved changes.",
    },
    preview: { bn: "প্রিভিউ", en: "Preview" },
    publish: { bn: "প্রকাশ করুন", en: "Publish" },
    unpublish: { bn: "অপ্রকাশিত করুন", en: "Unpublish" },
    publishStory: { bn: "গল্প প্রকাশ করুন", en: "Publish story" },
    publishConfirm: {
      bn: "এই অধ্যায়টি প্রকাশ করবেন? প্রকাশের পর সবাই পড়তে পারবে।",
      en: "Publish this chapter? It will become readable by everyone.",
    },
    markComplete: { bn: "সমাপ্ত হিসেবে চিহ্নিত", en: "Mark as complete" },
    markOngoing: { bn: "চলমান হিসেবে চিহ্নিত", en: "Mark as ongoing" },
    deleteConfirm: {
      bn: "আপনি কি নিশ্চিত? এই কাজটি ফিরিয়ে নেওয়া যাবে না।",
      en: "Are you sure? This cannot be undone.",
    },
    wordCount: { bn: "শব্দ", en: "words" },
    storyStatus: { bn: "অবস্থা", en: "Status" },
    needChapterFirst: {
      bn: "গল্প প্রকাশের আগে একটি অধ্যায় লিখে প্রকাশ করুন।",
      en: "Write and publish a chapter before publishing the story.",
    },
    lastChapterWarning: {
      bn: "এটি শেষ প্রকাশিত অধ্যায়। অপ্রকাশিত করলে গল্পটি Discover ও সার্চ থেকে লুকিয়ে যাবে, যতক্ষণ না আবার কোনো অধ্যায় প্রকাশ করেন।",
      en: "This is the last published chapter. Unpublishing it will hide the story from Discover and search until you publish a chapter again.",
    },
  },
  discover: {
    title: { bn: "ঘুরে দেখুন", en: "Discover" },
    searchPlaceholder: {
      bn: "গল্প, লেখক বা ট্যাগ খুঁজুন…",
      en: "Search stories, authors, tags…",
    },
    language: { bn: "ভাষা", en: "Language" },
    allLanguages: { bn: "সব ভাষা", en: "All languages" },
    bangla: { bn: "বাংলা", en: "Bangla" },
    english: { bn: "English", en: "English" },
    genre: { bn: "ধারা", en: "Genre" },
    allGenres: { bn: "সব ধারা", en: "All genres" },
    sort: { bn: "সাজান", en: "Sort" },
    newest: { bn: "নতুন", en: "Newest" },
    popular: { bn: "জনপ্রিয়", en: "Most read" },
    mostViewed: { bn: "সর্বাধিক দেখা", en: "Most viewed" },
    noResults: {
      bn: "কিছু পাওয়া যায়নি। অন্য কিছু খুঁজে দেখুন।",
      en: "Nothing found. Try a different search.",
    },
    resultsFor: { bn: "ফলাফল", en: "results for" },
  },
  reports: {
    title: { bn: "রিপোর্ট করুন", en: "Report content" },
    reason: { bn: "কারণ", en: "Reason" },
    reasonPlaceholder: {
      bn: "যেমন: কপি করা কনটেন্ট, হয়রানি…",
      en: "e.g. plagiarised content, harassment…",
    },
    details: { bn: "বিস্তারিত (ঐচ্ছিক)", en: "Details (optional)" },
    submit: { bn: "রিপোর্ট পাঠান", en: "Submit report" },
    submitted: {
      bn: "রিপোর্ট পাঠানো হয়েছে। মডারেশন টিম দেখবে।",
      en: "Report submitted. The moderation team will review it.",
    },
  },
  moderation: {
    title: { bn: "মডারেশন", en: "Moderation" },
    queue: { bn: "রিপোর্ট তালিকা", en: "Report queue" },
    audit: { bn: "অডিট লগ", en: "Audit log" },
    open: { bn: "খোলা", en: "Open" },
    inReview: { bn: "পর্যালোচনাধীন", en: "In review" },
    resolved: { bn: "সমাধানকৃত", en: "Resolved" },
    dismissed: { bn: "খারিজ", en: "Dismissed" },
    hideStory: { bn: "গল্প লুকান", en: "Hide story" },
    unhideStory: { bn: "গল্প ফিরিয়ে আনুন", en: "Restore story" },
    hideChapter: { bn: "অধ্যায় লুকান", en: "Hide chapter" },
    hideComment: { bn: "মন্তব্য লুকান", en: "Hide comment" },
    restore: { bn: "ফিরিয়ে আনুন", en: "Restore" },
    restoreConfirmTitle: { bn: "কনটেন্ট ফিরিয়ে আনবেন?", en: "Restore this content?" },
    restoreConfirmBody: {
      bn: "এটি আবার সবার জন্য দৃশ্যমান হবে। এই পদক্ষেপ অডিট লগে সংরক্ষিত থাকবে।",
      en: "It will become visible to everyone again. This action is kept in the audit log.",
    },
    statusLabel: { bn: "অবস্থা", en: "Status" },
    markResolved: { bn: "সমাধানকৃত চিহ্নিত", en: "Mark resolved" },
    markInReview: { bn: "পর্যালোচনাধীন চিহ্নিত", en: "Mark in review" },
    dismiss: { bn: "খারিজ করুন", en: "Dismiss" },
    empty: {
      bn: "কোনো খোলা রিপোর্ট নেই।",
      en: "No open reports. All quiet.",
    },
    reportedBy: { bn: "রিপোর্টকারী", en: "Reported by" },
    target: { bn: "লক্ষ্য", en: "Target" },
    action: { bn: "পদক্ষেপ", en: "Action" },
    by: { bn: "কর্তৃক", en: "by" },
    at: { bn: "", en: "at" },
  },
  appeals: {
    title: { bn: "আপিল", en: "Appeals" },
    requestReview: { bn: "পুনর্বিবেচনার অনুরোধ", en: "Request review" },
    reason: { bn: "কারণ", en: "Reason" },
    reasonPlaceholder: {
      bn: "কেন এই সিদ্ধান্ত পুনর্বিবেচনা করা উচিত বলে মনে করেন…",
      en: "Why do you think this decision should be reconsidered…",
    },
    submit: { bn: "আপিল পাঠান", en: "Submit appeal" },
    submitted: {
      bn: "আপিল পাঠানো হয়েছে। একজন মডারেটর পর্যালোচনা করবেন।",
      en: "Appeal submitted. A moderator will review it.",
    },
    pending: { bn: "পর্যালোচনাধীন", en: "Pending review" },
    approved: { bn: "গৃহীত", en: "Approved" },
    declined: { bn: "খারিজ", en: "Declined" },
    approve: { bn: "অনুমোদন", en: "Approve" },
    decline: { bn: "খারিজ করুন", en: "Decline" },
    decisionNote: { bn: "সিদ্ধান্তের নোট (ঐচ্ছিক)", en: "Decision note (optional)" },
    decisionNotePlaceholder: {
      bn: "লেখকের জন্য সংক্ষিপ্ত ব্যাখ্যা…",
      en: "A short explanation for the writer…",
    },
    hiddenNotice: {
      bn: "মডারেশনের কারণে এই কনটেন্টটি লুকানো হয়েছে।",
      en: "This content was hidden by moderation.",
    },
    hiddenExplained: {
      bn: "একজন মডারেটর আপনার কনটেন্ট লুকিয়েছেন। নিচে পুনর্বিবেচনার অনুরোধ করতে পারেন।",
      en: "A moderator hid your content. You can request a review below.",
    },
    appealPending: {
      bn: "আপনার আপিল পর্যালোচনাধীন আছে। সিদ্ধান্ত জানিয়ে দেওয়া হবে।",
      en: "Your appeal is pending review. You'll be notified of the decision.",
    },
    decidedNote: { bn: "মডারেটরের নোট", en: "Moderator's note" },
    approveNote: {
      bn: "আপিল গৃহীত হলেও কনটেন্ট স্বয়ংক্রিয়ভাবে ফিরবে না — মডারেটরকে আলাদাভাবে ফিরিয়ে আনতে হবে।",
      en: "Approving an appeal does not restore content automatically — a moderator must restore it separately.",
    },
    empty: { bn: "কোনো আপিল নেই।", en: "No appeals." },
    alreadyPending: {
      bn: "এই কনটেন্টের জন্য ইতিমধ্যে একটি আপিল পর্যালোচনাধীন আছে।",
      en: "An appeal for this content is already pending review.",
    },
  },
  notifications: {
    inbox: { bn: "ইনবক্স", en: "Inbox" },
    markAllRead: { bn: "সব পড়া হিসেবে চিহ্নিত", en: "Mark all read" },
    empty: { bn: "কোনো বিজ্ঞপ্তি নেই।", en: "No notifications yet." },
    emptyHint: {
      bn: "অনুসৃত লেখকের নতুন অধ্যায় ও রিপোর্টের হালনাগাদ এখানে আসবে।",
      en: "New chapters from followed authors and report updates will appear here.",
    },
    newChapterTitle: { bn: "নতুন অধ্যায় প্রকাশিত", en: "New chapter published" },
    newChapterBody: {
      bn: "{authorName} «{storyTitle}»-এ নতুন অধ্যায় প্রকাশ করেছেন: «{chapterTitle}»",
      en: "{authorName} published a new chapter in “{storyTitle}”: “{chapterTitle}”",
    },
    reportReceivedTitle: { bn: "নতুন রিপোর্ট", en: "New report" },
    reportReceivedBody: {
      bn: "একটি {targetType} রিপোর্ট করা হয়েছে: {reason}",
      en: "A {targetType} was reported: {reason}",
    },
    reportUpdateTitle: { bn: "রিপোর্টের হালনাগাদ", en: "Report update" },
    reportUpdateBody: {
      bn: "আপনার রিপোর্ট ({targetLabel}) এখন {status}",
      en: "Your report ({targetLabel}) is now {status}",
    },
    contentHiddenTitle: { bn: "কনটেন্ট লুকানো হয়েছে", en: "Content hidden" },
    contentHiddenBody: {
      bn: "মডারেশনের কারণে «{targetLabel}» লুকানো হয়েছে।",
      en: "“{targetLabel}” was hidden by moderation.",
    },
    contentRestoredTitle: { bn: "কনটেন্ট ফিরিয়ে আনা হয়েছে", en: "Content restored" },
    contentRestoredBody: {
      bn: "«{targetLabel}» আবার দৃশ্যমান।",
      en: "“{targetLabel}” is visible again.",
    },
    appealSubmittedTitle: { bn: "নতুন আপিল", en: "New appeal" },
    appealSubmittedBody: {
      bn: "{authorName} «{targetLabel}»-এর পুনর্বিবেচনার অনুরোধ করেছেন।",
      en: "{authorName} requested a review of “{targetLabel}”.",
    },
    appealDecisionTitle: { bn: "আপিলের সিদ্ধান্ত", en: "Appeal decision" },
    appealDecisionBody: {
      bn: "«{targetLabel}»-এর আপিল {decision} হয়েছে।",
      en: "Your appeal for “{targetLabel}” was {decision}.",
    },
    prefsTitle: { bn: "বিজ্ঞপ্তি পছন্দ", en: "Notification preferences" },
    prefNewChapter: {
      bn: "অনুসৃত লেখকের নতুন অধ্যায়",
      en: "New chapters from followed authors",
    },
    prefReportUpdates: {
      bn: "আমার রিপোর্টের হালনাগাদ",
      en: "Updates on my reports",
    },
    prefModerationUpdates: {
      bn: "আমার কনটেন্টে মডারেশন পদক্ষেপ",
      en: "Moderation actions on my content",
    },
    prefModeratorAlerts: {
      bn: "নতুন রিপোর্ট/আপিলের সতর্কতা (মডারেটর)",
      en: "New report/appeal alerts (moderators)",
    },
  },
  settings: {
    title: { bn: "সেটিংস", en: "Settings" },
    displayName: { bn: "প্রদর্শন নাম", en: "Display name" },
    bio: { bn: "বায়ো", en: "Bio" },
    interfaceLanguage: { bn: "ইন্টারফেসের ভাষা", en: "Interface language" },
    save: { bn: "সংরক্ষণ করুন", en: "Save changes" },
    saved: { bn: "সংরক্ষিত হয়েছে।", en: "Changes saved." },
  },
  common: {
    cancel: { bn: "বাতিল", en: "Cancel" },
    confirm: { bn: "নিশ্চিত করুন", en: "Confirm" },
    delete: { bn: "মুছুন", en: "Delete" },
    edit: { bn: "সম্পাদনা", en: "Edit" },
    close: { bn: "বন্ধ করুন", en: "Close" },
    back: { bn: "ফিরে যান", en: "Back" },
    loading: { bn: "লোড হচ্ছে…", en: "Loading…" },
    retry: { bn: "পুনরায় চেষ্টা", en: "Retry" },
    viewProfile: { bn: "প্রোফাইল দেখুন", en: "View profile" },
    demoMode: {
      bn: "ডেমো মোড — তথ্য এই ব্রাউজারেই থাকবে।",
      en: "Demo mode — data stays in this browser.",
    },
    inbox: { bn: "ইনবক্স", en: "Inbox" },
  },
  errors: {
    generic: {
      bn: "কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।",
      en: "Something went wrong. Please try again.",
    },
    notFound: { bn: "খুঁজে পাওয়া যায়নি।", en: "Not found." },
    signInFailed: {
      bn: "সাইন ইন ব্যর্থ। ইমেইল ও পাসওয়ার্ড চেক করুন।",
      en: "Sign in failed. Check your email and password.",
    },
    usernameTaken: {
      bn: "এই ইউজারনেমটি নেওয়া হয়ে গেছে।",
      en: "This username is taken.",
    },
    emailTaken: {
      bn: "এই ইমেইলে ইতিমধ্যে অ্যাকাউন্ট আছে।",
      en: "An account with this email already exists.",
    },
    weakPassword: {
      bn: "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।",
      en: "Password must be at least 6 characters.",
    },
    invalidUsername: {
      bn: "ইউজারনেম সঠিক নয়।",
      en: "Invalid username.",
    },
    emptyChapter: {
      bn: "প্রকাশের আগে অধ্যায়ে কিছু লিখুন।",
      en: "Write something before publishing.",
    },
    emptyTitle: {
      bn: "শিরোনাম দিন।",
      en: "Please add a title.",
    },
    noPublishedChapters: {
      bn: "প্রকাশের আগে কমপক্ষে একটি অধ্যায় প্রকাশ করুন।",
      en: "Publish at least one chapter before publishing the story.",
    },
    signInRequired: {
      bn: "এই কাজের জন্য সাইন ইন করুন।",
      en: "Please sign in to do that.",
    },
    notAuthor: {
      bn: "শুধু লেখক এটি করতে পারেন।",
      en: "Only the author can do that.",
    },
    notModerator: {
      bn: "শুধু মডারেটররা এই পেজ দেখতে পারেন।",
      en: "Only moderators can view this page.",
    },
  },
} as const;

export type DictKey = keyof typeof dict;

type Entry = { bn: string; en: string };
type Section = Entry | Record<string, Entry>;

export function t(locale: Locale, section: DictKey, key: string): string {
  const s = (dict as Record<string, Section>)[section] as Record<string, Entry> | Entry | undefined;
  if (!s) return key;
  // Some sections (brand) are a single entry; most are keyed groups.
  const entry = (s as Entry).bn !== undefined ? (s as Entry) : (s as Record<string, Entry>)[key];
  if (!entry) return key;
  return entry[locale] ?? entry.en ?? key;
}
