import { TopBar } from '../components'

export function About({ onBack }: { onBack: () => void }) {
  return (
    <main className="screen narrow prose">
      <TopBar onBack={onBack} title="How it works" />
      <h2>What you do</h2>
      <p>
        You see one real watch photo at a time and react to the look of it: <b>Yay</b>, <b>Nay</b> or <b>Pass</b>. Brand names
        stay hidden until the results, so you judge the design rather than the name.
      </p>
      <h2>How the cards are chosen</h2>
      <p>
        The first round is the same hand-picked mix for everyone — round and rectangular, gold and steel, dressy and sporty,
        simple and busy — so every kind of design gets a fair look. After that, exploration adapts: more designs close to each
        group of watches you liked (taking turns, so one taste doesn&rsquo;t crowd out another), a few near-lookalikes that differ
        in one detail to find out which detail matters, designs nobody has asked you about yet, and regular wildcards.
      </p>
      <h2>Pass and Undo</h2>
      <p>
        Pass means &ldquo;no opinion&rdquo;: it never counts as a like or a dislike. Undo removes your last reaction completely —
        everything is recalculated as if it never happened.
      </p>
      <h2>What the results mean</h2>
      <p>
        Your favourites are simply the watches you said Yay to. Observations only appear once there is enough to go on, and they
        always show the actual counts (&ldquo;5 of the 6 watches with a blue face&rdquo;). There are no match percentages and no
        personality types — just what you reacted to.
      </p>
      <p>
        Liking a photo is not the same as wanting to buy the watch, and it says nothing about how it would sit on a wrist. Size,
        weight and comfort need trying on.
      </p>
      <h2>Privacy</h2>
      <p>
        Everything stays in this browser on this device. There are no accounts, nothing is uploaded, and no AI service is
        contacted. A results link carries the results inside the link itself.
      </p>
    </main>
  )
}
