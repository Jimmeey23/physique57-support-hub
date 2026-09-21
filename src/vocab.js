/* Controlled vocabularies shared by the generated field plan and the desk UI.
   `scripts/enrich-repo.mjs` imports this file, so a dropdown in the form and the identical
   dropdown in the class desk / resolution panel can never drift apart. */

export const AUDIENCE = ['Beginner-friendly crowd', 'Regulars / advanced', 'Mostly first-timers', 'Corporate group',
  'Friends / family booking', 'Members with kids nearby', 'Online-only audience', 'On-demand / recorded audience',
  'Press or influencer invited', 'Prospective members (trial class)', 'Members with injuries or modifications',
  'Prenatal / postnatal', 'Senior members', 'Teen members', 'Guests and visitors', 'Private booking'];

export const DISRUPTION = ['None', 'Slight — carried on', 'Noticed but recoverable', 'Class shortened', 'Class abandoned',
  'Members left mid-session', 'Injury risk', 'Other studio disturbed'];

export const ATT_STATUS = ['Attended', 'Late arrival', 'Left early', 'No-show', 'Cancelled before the class',
  'On the waitlist, never added', 'Turned away at the door', 'Added as a guest', 'Double-booked spot',
  'Checked in but did not train', 'Attended, asked to stop (safety)'];

export const ATT_TAGS = ['First timer', 'Long-standing regular', 'Travelled for this', 'Anniversary / celebration',
  'Complaint already filed', 'Refund requested', 'Training for an event', 'Medical modification', 'Prenatal',
  'Senior member', 'Needs a buddy / pair', 'Brought a guest', 'Late for the class', 'Left before cool-down',
  'Noisy or disruptive', 'Outstanding on account', 'Churn risk', 'Loyal — retain carefully', 'Barrepreneur cohort',
  'Needs a follow-up call'];

export const ATT_ACTION = ['Nothing needed', 'Class credit granted', 'Manual check-in in Momence', 'Added from the waitlist',
  'Guest pass issued', 'Money credit adjusted', 'Usage-limit override', 'Membership freeze scheduled',
  'Freeze removed', 'Refund raised with accounts', 'Waived late-cancellation fee', 'Follow-up call promised',
  'Apology + next class free', 'Escalated to the desk owner'];

export const COACHING = ['Verbal cueing', 'Physical adjustments', 'Music and pacing', 'Warm-up / cool-down length',
  'Safety and form', 'Inclusion of beginners', 'Intensity for regulars', 'Use of the room / equipment',
  'Attendance at the scheduled time', 'Handling a modification request', 'Energy and motivation',
  'Class explanation / onboarding', 'Corrections after the class', 'Communication with the desk'];

export const SENTIMENT = ['Very happy', 'Happy', 'Neutral', 'Annoyed', 'Upset', 'Angry', 'Would not return', 'Asked for a refund'];

export const CLASS_ASPECT = ['Coaching', 'Class design / method', 'Music', 'Safety', 'Scheduling', 'The room / equipment',
  'The desk / check-in', 'Compatibility & billing', 'Crowd mix', 'Attendance', 'Other'];

export const HOST_SITUATION = ['As scheduled', 'Guest coach stood in', 'Trainer late', 'Trainer absent, class cancelled',
  'Assistant ran it', 'Self-led / no coach', 'Substituted at the door'];

export const EXPERIENCE_EFFECT = ['None — ran as designed', 'Members got a lesser class', 'Class ran short', 'Class overran',
  'A member could not take it at all', 'A member was turned away', 'A booking was double-sold', 'An unsign-up walked in',
  'Music or lighting spoiled it', 'Equipment ran out mid-class'];

export const ATTENDANCE_MATCH = ['Matches the roll', 'More heads than bookings', 'Fewer heads than bookings',
  'Cannot reconcile — spotter did not count', 'Waitlist pressure hidden'];

export const CAPACITY_NEED = ['More bikes / mats', 'A bigger room', 'Another speaker', 'A lighting change', 'AC adjustment',
  'An assistant coach', 'Longer slot', 'Shorter slot', 'A different time', 'More front-desk cover', 'A fixed console',
  'Signage at the door'];

export const BOOKING_FRICTION = ['None reported', 'Class looked full but was not', 'Waitlist never converted',
  'Cancel blocked inside the window', 'Paywall error at checkout', 'Membership not accepted', 'Wrong studio listed',
  'Duplicate booking allowed', 'Could not find the class', 'App time-zone confusion'];

export const REBOOKING_INTENT = ['Everyone rebooked', 'Some rebooked', 'Nobody rebooked', 'Asked to hold places',
  'Waiting on a decision', 'Not asked'];

export const REPORT_CHANNEL = ['In person at the desk', 'Phone call', 'WhatsApp message', 'Email', 'Momence app / web enquiry',
  'Instagram / Facebook DM', 'Google review', 'Walk-in complaint', 'Trainer reported it', 'CCTV or audit review'];

export const FOLLOW_UP_CHANNEL = ['WhatsApp', 'Email', 'Phone call', 'In person at the studio', 'Reply in the app', 'No follow-up needed'];

/* ---------- resolution capture ---------- */
export const RES_CAUSE = ['Wear and tear', 'Member misuse', 'Installation / fitment', 'Vendor workmanship', 'Software bug (Momence)',
  'Software bug (our side)', 'Network / connectivity', 'SOP not followed', 'SOP missing', 'Staff shortage',
  'Scheduling error', 'Communication gap at the desk', 'Billing configuration', 'Policy ambiguity',
  'Member misunderstanding', 'Third party (building / society)', 'Vandalism', 'Not reproducible'];
export const RES_OWNER = ['Studio team', 'Vendor / technician', 'Momence support', 'Our developer', 'Accounts / finance',
  'Head coach / training team', 'Building management', 'Member action needed'];
export const RES_OUTCOME = ['Fixed at the studio', 'Fixed by vendor', 'Replaced / upgraded', 'Workaround agreed',
  'Not reproducible', 'Member educated / no fault', 'Escalated permanently', 'Refunded / credit issued',
  'Policy or SOP changed', 'Configuration changed in Momence'];
export const RES_FOLLOWUP = ['Not needed', 'Call the member', 'WhatsApp a confirmation', 'Email with the receipt / credit note',
  'Tell them at the next class', 'Manager to call', 'Re-check after the next class', 'Wait for the member to reply'];
export const RES_GOODWILL = ['None', '1 class credit granted', '2 class credits granted', 'Pack validity extended',
  'Membership freeze granted', 'Money credit adjusted', 'Refund issued', 'Guest pass offered', 'Boutique voucher',
  'Personal apology from the studio head'];
export const RES_PREVENTION = ['Nothing to change', 'SOP updated', 'New checklist added', 'Staff briefing done',
  'Trainer coaching note filed', 'Pre-class walkthrough added', 'Console / equipment servicing scheduled',
  'AMC terms changed', 'Vendor changed', 'Signage added', 'Booking rules changed in Momence',
  'Front-desk script updated', 'Automated alert configured'];
export const RES_PROOF = ['Nothing attached', 'Photo before / after', 'Vendor invoice', 'Momence screenshot', 'CCTV clip reference',
  'Member chat screenshot', 'Receipt / credit note', 'Console log'];
export const RES_REOPEN_RISK = ['Low', 'Medium', 'High'];
export const RES_ASSET_CONDITION = ['Working', 'Working with a caveat', 'Out of service', 'Being serviced', 'Waiting for a part', 'Replaced', 'Retired'];
export const RES_CLASS_FOLLOWUP = ['No class impact to report', 'Missed members credited', 'A repeat class offered',
  'Attendance reconciled in Momence', 'Waitlist members added', 'Roster note filed against the trainer',
  'Audience note filed against the trainer'];

export const VOCAB = {
  contact_attempted: { type: 'select', options: ['No', 'Yes — call', 'Yes — WhatsApp', 'Yes — email', 'Yes — in person at the desk', 'Left a message'] },
  medical_response: { type: 'select', options: ['Not needed', 'First-aid kit used', 'Trainer assessed on the spot',
    'Ice / rest offered', 'Ambulance called', 'Member declined help', 'Incident form filed'] },
  guest_arranged: { type: 'select', options: ['No guest involved', 'Yes — guest pass booked', 'Yes — member’s guest, paid at the desk',
    'Yes — corporate invite', 'Yes — walked in, added by the desk'] },
  approval_ref: { type: 'select', options: ['Not required', 'Manager on duty', 'Head of department', 'Founder / owner',
    'Vendor approval', 'Accounts approval'] },
  error_text: { type: 'select', options: ['No error shown', 'Screen froze / blank', 'Card declined — generic message',
    '“Booking unavailable”', '“Session not found”', 'HTTP 401 / token expired', 'HTTP 500 — server error',
    'Payment captured, no receipt', 'App crashed'] },
  last_restart: { type: 'select', options: ['Not yet', 'Rebooted the device', 'Closed and reopened the app',
    'Reconnected Wi-Fi / router', 'Tried another device', 'Cleared cache / reinstalled', 'Vendor rebooted it remotely'] },
  repro_steps: { type: 'select', options: ['Reproduced on the first try', 'Reproduced once out of several',
    'Only on the front-desk iPad', 'Only on member mobile app', 'Could not reproduce', 'Reproduced with another member’s account'] },
};

/* ---------- extra detail the field plan didn't ask for ---------- */
export const GROUPS = {
  class: [
    { id: 'class_host_situation', label: 'Who hosted the class', type: 'select', options: HOST_SITUATION },
    { id: 'class_audience', label: 'Who was in the room', type: 'multiselect', options: AUDIENCE },
    { id: 'class_disruption', label: 'What happened to the class', type: 'select', options: DISRUPTION },
    { id: 'class_experience_effect', label: 'Effect on the experience', type: 'select', options: EXPERIENCE_EFFECT },
    { id: 'class_attendance_match', label: 'Attendance vs. what Momence shows', type: 'select', options: ATTENDANCE_MATCH },
    { id: 'class_audience_notes', label: 'Notes on the audience', type: 'textarea' },
    { id: 'class_host_notes', label: 'Notes on the host / coach', type: 'textarea' },
    { id: 'class_compatibility_notes', label: 'Notes on membership compatibility', type: 'textarea' },
    { id: 'class_capacity_need', label: 'What the class needed', type: 'multiselect', options: CAPACITY_NEED },
    { id: 'class_booking_friction', label: 'Booking friction members hit', type: 'multiselect', options: BOOKING_FRICTION },
    { id: 'class_rebooking_intent', label: 'Will they come back?', type: 'select', options: REBOOKING_INTENT },
  ],
  roster: [
    { id: 'attendee_flag_count', label: 'Attendees needing a follow-up', type: 'number' },
    { id: 'attendee_actions_taken', label: 'What was offered', type: 'multiselect', options: ATT_ACTION },
    { id: 'attendee_summary', label: 'Summary of what each attendee said', type: 'textarea' },
    { id: 'attendees_affected', label: 'Attendees this ticket is about', type: 'lookup', module: 'member', multi: true },
  ],
  trainer: [
    { id: 'trainer_feedback_type', label: 'This feedback is about', type: 'multiselect', options: COACHING },
    { id: 'trainer_sentiment', label: 'Sentiment of what came back', type: 'select', options: SENTIMENT },
    { id: 'trainer_rating', label: 'Teaching rating (1–5)', type: 'select', options: ['1', '2', '3', '4', '5'] },
    { id: 'trainer_action_now', label: 'What the desk did in the room', type: 'select',
      options: ['Nothing yet', 'Spoke to the trainer after class', 'Asked members to stay and share',
        'Adjusted the plan for the next batch', 'Removed from the next schedule', 'Paused until reviewed',
        'Praised in the team thread', 'Logged for the review cycle'] },
    { id: 'trainer_review_cycle', label: 'Put it in the review cycle', type: 'select',
      options: ['Not needed', 'Add to next 1:1', 'Formal review this quarter', 'Method retraining',
        'Shadow a senior class', 'Scheduling change only'] },
    { id: 'trainer_method_reference', label: 'Which method / SOP was involved', type: 'select',
      options: ['Beginner onboarding', 'Correction protocol', 'Modifications & injuries', 'Music selection', 'Class pacing',
        'Warm-up block', 'Finisher block', 'Cool-down block', 'Barre positions', 'Cycle resistance guidance',
        'Studio safety drill', 'Not method-related'] },
  ],
  asset: [
    { id: 'asset_count_affected', label: 'How many units are affected', type: 'number' },
    { id: 'asset_fault_kind', label: 'What kind of fault', type: 'select',
      options: ['Mechanical', 'Electrical', 'Console / software', 'Cosmetic', 'Safety-critical', 'Noise', 'Wear and tear',
        'Missing part', 'Misuse by a member', 'Unknown'] },
    { id: 'asset_took_out_of_service', label: 'Taken out of rotation?', type: 'select',
      options: ['No', 'Yes — one unit', 'Yes — a whole row', 'Yes — the whole room'] },
    { id: 'asset_workaround', label: 'Workaround the members got', type: 'select',
      options: ['None needed', 'Moved to another unit', 'Class reformatted', 'Substituted a bodyweight block',
        'Reduced capacity for the class', 'Told to come back another day'] },
  ],
  payment: [
    { id: 'payment_charge_state', label: 'What the money did', type: 'select',
      options: ['Nothing charged', 'Charged correctly', 'Charged twice', 'Charged the wrong amount', 'Captured but no receipt',
        'Refunded already', 'Refund pending', 'Card declined at the desk', 'Cash taken, not recorded', 'Credit note promised'] },
    { id: 'payment_amount_inr', label: 'Amount involved (₹)', type: 'number' },
    { id: 'payment_gateway', label: 'Gateway / rail', type: 'select',
      options: ['Not applicable', 'Razorpay UPI', 'Razorpay card', 'Stripe', 'POS card machine', 'Cash at the desk',
        'Bank transfer', 'Paytm', 'Momence checkout'] },
    { id: 'payment_receipt_shared', label: 'Receipt / invoice status', type: 'select',
      options: ['Auto-sent by Momence', 'Resent manually', 'Emailed as a PDF', 'Not needed', 'Member cannot open it', 'GST details corrected'] },
  ],
  vendor: [
    { id: 'vendor_quotation', label: 'Quotation', type: 'select',
      options: ['Not sought', 'Verbal estimate given', 'Written quote received', 'Quote approved', 'Awaiting finance', 'Rejected as uneconomical'] },
    { id: 'vendor_sla_agreed', label: 'Visit window agreed', type: 'select',
      options: ['Same day', 'Next business day', '2–3 days', 'This week', 'Next week', 'No commitment', 'AMC covers it'] },
    { id: 'vendor_poa_status', label: 'AMC / warranty position', type: 'select',
      options: ['Not applicable', 'Under warranty', 'AMC covers labour only', 'AMC covers parts and labour',
        'Out of warranty — paid', 'Warranty voided by misuse'] },
    { id: 'vendor_next_action', label: 'What happens next', type: 'select',
      options: ['Call the vendor', 'Raise on the AMC portal', 'Email for a quotation', 'Book a slot', 'Chase the pending visit', 'Close after installation'] },
  ],
};

export const GROUP_KEYS = {
  class: /class|session|schedule|schedul|trainer|music|waitlist|booking|capacity|guest|event|workshop|retreat|course/i,
  roster: /class|session|schedule|trainer|music|waitlist|capacity|guest|event/i,
  trainer: /trainer|teach|method|music|coach|class|session|scheduling|feedback/i,
  asset: /equipment|machine|bike|console|repair|maintenance|amenit|facilit|asset|powercycle|gym|room|sound|light|ac\/hvac/i,
  payment: /payment|billing|price|pricing|discount|refund|invoice|tax|receipt|membership|freeze|subscription|sales/i,
  vendor: /vendor|amc|contract|installation|repair|maintenance|third[- ]party|suppl/i,
};

export const UNIVERSAL = [
  { id: 'report_channel', after: 'reporter_type', label: 'How this reached us', type: 'select', options: REPORT_CHANNEL,
    desc: 'Which channel the report arrived on — it decides the reply route and what proof exists.' },
  { id: 'follow_up_channel', after: 'preferred_contact', label: 'Where the member wants the answer', type: 'select', options: FOLLOW_UP_CHANNEL,
    desc: 'Only a channel the reporter actually gave us.' },
];

/** Every extra field, keyed by id — used by the desk UI and by tests that need to know the
    answer must come from a list rather than from free typing. */
export const ALL_GROUPS = { ...GROUPS };
