// Form cues per exercise — concise coaching points + common mistakes to avoid.
// Keyed by the exact exercise name in exercises.js. Missing names fall back to a
// generic message in the UI.
export const CUES = {
  // ── Chest ──
  'Bench Press (Barbell)': ['Retract shoulder blades and keep them pinned to the bench','Lower the bar to mid-chest with elbows ~75°, not flared to 90°','Keep feet planted and drive through them; wrists stacked over elbows'],
  'Bench Press (Dumbbell)': ['Start with dumbbells over your chest, slight arch in the upper back','Lower until you feel a stretch, elbows tucked ~45–75°','Press up and slightly in without clashing the bells'],
  'Incline Bench Press (Barbell)': ['Set bench to 30–45° — higher hits shoulders more','Lower bar to upper chest/clavicle line','Keep glutes on the bench, no bouncing off the chest'],
  'Incline Bench Press (Dumbbell)': ['30–45° incline, shoulder blades retracted','Lower to the upper chest with a controlled stretch','Drive the dumbbells up and together at the top'],
  'Decline Bench Press': ['Secure your legs before unracking','Lower the bar to the lower chest','Keep elbows tucked and control the descent'],
  'Chest Fly (Dumbbell)': ['Soft bend in the elbows, hold it throughout','Open arms in a wide arc until you feel a chest stretch','Squeeze the chest to bring them together — don’t press'],
  'Cable Fly': ['Slight forward lean, stable split stance','Sweep hands together in an arc, elbows slightly bent','Squeeze at the midline; resist the stretch on the way back'],
  'Push Up': ['Body in a straight line — brace your core and glutes','Hands under/slightly outside shoulders, elbows ~45°','Lower your chest to the floor, full range each rep'],
  'Chest Dip': ['Lean torso forward to bias the chest','Lower until you feel a stretch, elbows tracking back','Don’t shrug — keep shoulders down and back'],
  'Machine Chest Press': ['Set the seat so handles are at mid-chest height','Retract shoulder blades against the pad','Press smoothly without locking out hard'],
  'Pec Deck': ['Forearms/elbows flat on the pads at chest height','Squeeze the pads together using the chest','Control the return until you feel a stretch'],

  // ── Back ──
  'Deadlift (Barbell)': ['Bar over mid-foot; hips back, flat neutral spine','Brace hard, push the floor away, bar drags up the shins','Lock out with glutes — don’t hyperextend or lean back'],
  'Romanian Deadlift': ['Soft knees, push hips straight back','Lower the bar along the legs feeling a hamstring stretch','Keep the bar close and back flat; stop when hips stop moving'],
  'Sumo Deadlift': ['Wide stance, toes out, hands inside knees','Open the knees out over the toes, chest up','Drive hips through to lock out'],
  'Pull Up': ['Start from a dead hang, shoulders engaged','Drive elbows down and back, chest to the bar','Avoid kipping — control the lower'],
  'Chin Up': ['Underhand grip ~shoulder width','Lead with the chest, squeeze biceps and lats','Full hang at the bottom, no swinging'],
  'Lat Pulldown': ['Slight lean back, chest up, bar to upper chest','Drive elbows down toward your hips','Control the bar up — don’t let shoulders shrug'],
  'Seated Cable Row': ['Tall chest, slight forward lean to start','Pull to the navel, squeezing shoulder blades together','Don’t yank with the lower back — keep it stable'],
  'Bent Over Row (Barbell)': ['Hinge ~45°, flat back, brace the core','Pull the bar to the lower ribs/navel','Lead with the elbows; control down, no jerking'],
  'Bent Over Row (Dumbbell)': ['Hinge with a flat back, dumbbells hanging','Row to the hips, squeezing the back','Keep the neck neutral, no rounding'],
  'T-Bar Row': ['Flat back, chest up, knees soft','Pull the handle to your stomach','Squeeze the shoulder blades, control the negative'],
  'Single Arm Dumbbell Row': ['Brace on the bench, flat back','Row to the hip, elbow close to the body','Don’t rotate the torso to lift — keep it square'],
  'Face Pull': ['Rope at face height, pull toward the forehead','Aim elbows high and wide, externally rotate','Squeeze rear delts — light weight, high reps'],
  'Rack Pull': ['Bar set just below the knees','Flat back, brace, drive hips through','Great for lockout strength — keep the bar close'],
  'Cable Row (Wide Grip)': ['Wide grip, pull to the upper stomach','Elbows flare slightly to hit upper back','Keep the torso still, squeeze at the back'],
  'Straight Arm Pulldown': ['Slight hinge, arms nearly straight','Drive the bar to your thighs using the lats','Feel the lats stretch at the top'],

  // ── Shoulders ──
  'Overhead Press (Barbell)': ['Bar on the front delts, elbows slightly forward','Brace glutes/core, press up and slightly back','Move the head “through” at lockout; don’t lean back'],
  'Overhead Press (Dumbbell)': ['Start at shoulder height, wrists stacked','Press up without clashing the bells','Keep ribs down — don’t arch the lower back'],
  'Lateral Raise (Dumbbell)': ['Slight forward lean, soft elbows','Raise to shoulder height leading with the elbows','Control down slowly — no swinging or shrugging'],
  'Lateral Raise (Cable)': ['Cable from the low pulley behind you','Raise out to the side to shoulder height','Constant tension — slow eccentric'],
  'Front Raise (Dumbbell)': ['Raise to shoulder height, thumbs slightly up','Don’t use momentum from the hips','Lower under control'],
  'Arnold Press': ['Start palms facing you at chest height','Rotate palms out as you press overhead','Reverse smoothly on the way down'],
  'Rear Delt Fly (Dumbbell)': ['Hinge forward, flat back, soft elbows','Open arms wide leading with the elbows','Squeeze rear delts — light and controlled'],
  'Rear Delt Fly (Cable)': ['Cross cables, pull out and back','Elbows slightly bent, squeeze rear delts','Keep tension throughout the arc'],
  'Upright Row': ['Pull the bar up the body to chest height','Lead with the elbows, keep the bar close','Avoid if it pinches — keep grip a bit wider'],
  'Machine Shoulder Press': ['Set seat so handles are at shoulder height','Press up smoothly, don’t lock out hard','Keep your back against the pad'],
  'Cuban Press': ['Light weight — it’s a rotator-cuff move','High pull, externally rotate, then press','Slow and controlled throughout'],

  // ── Biceps ──
  'Barbell Curl': ['Elbows pinned at your sides','Curl without swinging the torso','Control the lower, full stretch at the bottom'],
  'Dumbbell Curl': ['Supinate (rotate palm up) as you curl','Keep elbows still, no shoulder swing','Squeeze at the top, slow negative'],
  'Hammer Curl': ['Neutral grip (palms facing in)','Elbows fixed, curl straight up','Hits the brachialis and forearm'],
  'Incline Dumbbell Curl': ['Lie back on an incline — arms behind the body','Curl with a deep stretch on the biceps','Keep elbows back; control the descent'],
  'Cable Curl': ['Constant tension from the low pulley','Elbows pinned, curl to the top','Resist on the way down'],
  'Preacher Curl': ['Armpits on top of the pad, upper arms flat','Curl up; don’t fully relax at the bottom','Slow eccentric — protect the elbow'],
  'Concentration Curl': ['Elbow braced on the inner thigh','Curl with strict form, peak squeeze','No body english'],
  'Spider Curl': ['Chest on an incline, arms hanging vertically','Curl up with elbows fixed','Maximum tension at the top'],
  'Reverse Curl': ['Overhand (pronated) grip','Elbows pinned, curl up','Targets forearms/brachialis — go lighter'],

  // ── Triceps ──
  'Tricep Pushdown (Cable)': ['Elbows pinned to your sides','Extend fully, squeeze the triceps','Only the forearms move'],
  'Skull Crusher': ['Upper arms vertical and still','Lower the bar to the forehead/behind the head','Extend without flaring the elbows'],
  'Overhead Tricep Extension': ['Upper arms by the ears, elbows in','Lower behind the head for a stretch','Extend fully without arching the back'],
  'Close Grip Bench Press': ['Grip ~shoulder width, elbows tucked tight','Lower to the lower chest','Drive up keeping elbows close'],
  'Tricep Dip': ['Stay upright to bias the triceps','Lower to ~90° at the elbows','Don’t shrug; keep shoulders down'],
  'Diamond Push Up': ['Hands together forming a diamond','Elbows tucked close to the body','Lower the chest to the hands, full range'],
  'Tricep Kickback': ['Hinge forward, upper arm parallel to the floor','Extend at the elbow, squeeze the triceps','Keep the upper arm still'],

  // ── Quads ──
  'Squat (Barbell)': ['Brace, big breath; break at hips and knees together','Knees track over toes, depth to ~parallel or below','Drive through mid-foot; chest stays up'],
  'Front Squat': ['Elbows high, bar on the front delts','Stay upright, knees track over toes','Brace hard; descend under control'],
  'Leg Press': ['Feet shoulder-width on the platform','Lower until ~90° without rounding the lower back','Don’t lock the knees out hard at the top'],
  'Hack Squat': ['Shoulders/back against the pad','Knees track over toes, controlled depth','Push through the whole foot'],
  'Leg Extension': ['Align knees with the machine pivot','Extend fully, squeeze the quads','Slow on the way down — no swinging'],
  'Bulgarian Split Squat': ['Rear foot on the bench, weight on the front leg','Lower straight down, front knee over the foot','Stay tall; drive through the front heel'],
  'Lunge (Barbell)': ['Step out, lower the back knee toward the floor','Front shin roughly vertical, torso upright','Drive through the front heel to stand'],
  'Lunge (Dumbbell)': ['Dumbbells at your sides, chest up','Lower under control, knee just off the floor','Push through the front heel'],
  'Goblet Squat': ['Hold the dumbbell at the chest','Sit between the hips, elbows inside the knees','Keep the chest up and heels down'],
  'Sissy Squat': ['Lean back, knees travel forward','Lower with control — big quad stretch','Hold support if needed; go slow'],

  // ── Hamstrings ──
  'Leg Curl (Lying)': ['Hips pressed into the pad','Curl the heels to the glutes','Slow eccentric — don’t let it slam'],
  'Leg Curl (Seated)': ['Pad just above the heels, thighs strapped','Curl down and squeeze the hamstrings','Control the return'],
  'Nordic Hamstring Curl': ['Anchor the ankles, body straight from knees up','Lower as slowly as possible','Use hands to catch and push back up'],
  'Romanian Deadlift (Dumbbell)': ['Soft knees, hinge hips back','Dumbbells close to the legs, feel the stretch','Flat back; squeeze glutes to stand'],
  'Good Morning': ['Bar on the upper back, soft knees','Hinge forward keeping a flat back','Feel hamstrings; return by driving hips forward'],
  'Glute Ham Raise': ['Lower under control from the knees','Keep hips extended (straight line)','Pull yourself back up with the hamstrings'],

  // ── Glutes ──
  'Hip Thrust (Barbell)': ['Shoulders on the bench, chin tucked','Drive through the heels, full hip extension','Squeeze glutes at top — don’t overarch the back'],
  'Hip Thrust (Bodyweight)': ['Heels close, drive hips up','Squeeze glutes hard at the top','Posterior pelvic tilt — ribs down'],
  'Cable Kickback': ['Hinge slightly, brace the core','Drive the leg back using the glute','Avoid arching the lower back'],
  'Sumo Squat': ['Wide stance, toes turned out','Sit straight down, knees over toes','Squeeze glutes to stand'],
  'Step Up': ['Whole foot on the box, drive through the heel','Stand tall; minimise push off the back foot','Control the descent'],
  'Abductor Machine': ['Sit tall, push the knees out','Pause at the end, squeeze the glutes','Control back in — no slamming'],
  'Donkey Kick': ['On all fours, neutral spine','Drive the heel toward the ceiling','Squeeze the glute; don’t arch the back'],

  // ── Calves ──
  'Calf Raise (Standing Machine)': ['Balls of the feet on the platform','Full stretch at the bottom, high rise on the toes','Pause at the top — no bouncing'],
  'Calf Raise (Seated Machine)': ['Pad on the lower thighs','Full range — deep stretch, high squeeze','Slow tempo targets the soleus'],
  'Calf Raise (Barbell)': ['Bar on the back, balls of the feet elevated','Rise high onto the toes','Control the stretch at the bottom'],
  'Calf Raise (Leg Press)': ['Toes on the bottom edge of the platform','Press through the balls of the feet','Full stretch and squeeze each rep'],
  'Jump Rope': ['Stay on the balls of the feet','Small, quick hops; wrists do the turning','Soft knees, relaxed shoulders'],

  // ── Core ──
  'Plank': ['Forearms under shoulders, straight line','Brace abs and squeeze glutes','Don’t let the hips sag or pike'],
  'Side Plank': ['Elbow under the shoulder, body straight','Lift the hips, stack or stagger the feet','Don’t let the hips drop'],
  'Crunch': ['Lower back stays down, curl the ribs to hips','Don’t pull on the neck','Slow and controlled — exhale up'],
  'Cable Crunch': ['Kneel, rope by the head','Crunch by flexing the spine, hips fixed','Curl the elbows toward the thighs'],
  'Leg Raise (Hanging)': ['Minimise swinging — control it','Posterior tilt: curl the pelvis up','Lower the legs slowly'],
  'Leg Raise (Lying)': ['Hands under the glutes, lower back flat','Lower the legs without arching','Raise back up under control'],
  'Russian Twist': ['Lean back, chest up, brace the core','Rotate from the trunk, not just the arms','Control each side — touch lightly'],
  'Ab Wheel Rollout': ['Brace hard, posterior pelvic tilt','Roll out only as far as you can keep a flat back','Pull back with the abs — no sagging'],
  'Decline Sit Up': ['Curl up rounding the spine, don’t just hip-flex','Control the descent','Avoid yanking the neck'],
  'Dragon Flag': ['Grip behind the head, body rigid','Lower the straight body slowly','Keep the core braced — no sagging hips'],
  'Pallof Press': ['Anti-rotation — resist the cable’s pull','Press straight out and back, hips square','Brace the core throughout'],

  // ── Cardio ──
  'Running (Treadmill)': ['Run tall, slight forward lean from the ankles','Land under your body, quick cadence','Relaxed shoulders and arms'],
  'Cycling (Stationary)': ['Set saddle so the knee is slightly bent at the bottom','Smooth, round pedal stroke','Keep the core engaged, shoulders relaxed'],
  'Rowing Machine': ['Drive order: legs → core → arms','Return order: arms → core → legs','Keep the back flat; don’t yank with the arms'],
  'Stair Master': ['Stand tall, don’t lean on the rails','Full steps through the whole foot','Keep a steady controlled pace'],
  'Assault Bike': ['Drive with the legs and pull/push the arms','Brace the core, sit tall','Pace your intervals — it spikes fast'],
  'Ski Erg': ['Hinge at the hips, engage the lats','Pull down and through, finish at the hips','Use the legs and core, not just arms'],
  'Elliptical': ['Stand tall, light grip on the handles','Push through the whole foot','Engage the core; smooth stride'],
};
