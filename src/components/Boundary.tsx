import { Component, type ErrorInfo, type ReactNode } from 'react'
import { IconRestart } from '../icons'

interface State {
  error: Error | null
}

/**
 * A crash must never leave a classroom looking at a blank screen.
 *
 * React unmounts the whole tree when a render throws and there is no boundary,
 * which is indistinguishable from the game vanishing. This catches it, says so
 * plainly, and offers the two recoveries that actually work: go back to the
 * board with the policy intact, or reload.
 */
export default class Boundary extends Component<{ children: ReactNode; onReset?: () => void }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the detail in the console for whoever is debugging the build.
    console.error('[SKAI] screen crashed', error, info.componentStack)
  }

  componentDidMount() {
    // Async faults never reach componentDidCatch, so they are at least logged
    // with a tag that makes them findable in a classroom bug report.
    window.addEventListener('error', this.onWindowError)
    window.addEventListener('unhandledrejection', this.onRejection)
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.onWindowError)
    window.removeEventListener('unhandledrejection', this.onRejection)
  }

  // These are logged, NOT promoted to the crash card. A missing image or an
  // aborted animation raises the same events as a genuine fault, and turning
  // those into a full-screen recovery card would be worse than the fault: the
  // crew would lose a working screen over a 404. Real render crashes are caught
  // by componentDidCatch above; async faults are guarded where they happen.
  private onWindowError = (event: ErrorEvent) => {
    if (event.error instanceof Error) console.error('[SKAI] uncaught', event.error)
  }

  private onRejection = (event: PromiseRejectionEvent) => {
    console.error('[SKAI] unhandled rejection', event.reason)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="crash-screen">
        <div className="crash-card">
          <h2>The car is fine. The screen is not.</h2>
          <p>
            Your rules are still saved. Go back to the board and pick the job again — or
            reload if it keeps happening.
          </p>
          <code className="crash-detail">{error.message}</code>
          <span className="crash-actions">
            {this.props.onReset && (
              <button
                className="btn primary"
                onClick={() => {
                  this.setState({ error: null })
                  this.props.onReset?.()
                }}
              >
                Back to the board
              </button>
            )}
            <button className="btn ghost" onClick={() => window.location.reload()}>
              <span className="btn-ico"><IconRestart /></span>Reload
            </button>
          </span>
        </div>
      </div>
    )
  }
}
