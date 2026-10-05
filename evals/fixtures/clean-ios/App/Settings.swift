import SwiftUI

struct SettingsView: View {
    @AppStorage("hasSeenOnboarding") var seen = false
    var body: some View { Toggle("Seen onboarding", isOn: $seen) }
}
