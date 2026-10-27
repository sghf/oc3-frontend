/**
 * The files a new compliance module starts from, in the languages offered:
 * the actions the agents run, their exit codes, and a ruleset variable read.
 */

/** The languages a new module can start from. */
export const TEMPLATE_LANGUAGES = ["sh", "bash", "python", "perl"] as const;
export type TemplateLanguage = (typeof TEMPLATE_LANGUAGES)[number];

/**
 * The ruleset variable a template reads: the agents export each variable of the
 * rulesets attached as OSVC_COMP_<NAME>.
 */
function variableOf(name: string): string {
  const base = name === "" ? "EXAMPLE" : name.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return `OSVC_COMP_${base}`;
}

/**
 * What the editor of a new module starts from, in a language: the three
 * actions the agents run, their exit codes, and a ruleset variable read.
 */
export function scriptTemplate(language: TemplateLanguage, name: string): string {
  const title = name === "" ? "<name>" : name;
  const variable = variableOf(name);
  switch (language) {
    case "sh":
      return `#!/bin/sh
# ${title}: what the module checks on the node.
#
# Run by the agent with one argument: check, fixable or fix. Exit 0:
# compliant, or fixed; 1: not compliant, or not fixed; 2: not applicable.
# The variables of the rulesets attached are in the environment, as
# OSVC_COMP_<NAME>.

wanted=\${${variable}:-}

check() {
    # Compare the node to "$wanted", tell what differs on stderr.
    return 0
}

case "$1" in
check)   check; exit $? ;;
fixable) exit 2 ;;
fix)     check; exit $? ;;
*)       echo "usage: $0 check|fixable|fix" >&2; exit 2 ;;
esac
`;
    case "bash":
      return `#!/bin/bash
# ${title}: what the module checks on the node.
#
# Run by the agent with one argument: check, fixable or fix. Exit 0:
# compliant, or fixed; 1: not compliant, or not fixed; 2: not applicable.
# The variables of the rulesets attached are in the environment, as
# OSVC_COMP_<NAME>.

set -o nounset -o pipefail

readonly OK=0 NOK=1 NA=2
wanted=\${${variable}:-}

check() {
    # Compare the node to "$wanted", tell what differs on stderr.
    return $OK
}

fixable() {
    return $NA
}

fix() {
    # Make the node compliant, then check again.
    check
}

case "\${1:-}" in
check | fixable | fix) "$1"; exit $? ;;
*) echo "usage: $0 check|fixable|fix" >&2; exit $NA ;;
esac
`;
    case "python":
      return `#!/usr/bin/env python3
"""${title}: what the module checks on the node.

Run by the agent with one argument: check, fixable or fix. Exit 0:
compliant, or fixed; 1: not compliant, or not fixed; 2: not applicable.
The variables of the rulesets attached are in the environment, as
OSVC_COMP_<NAME>.
"""

import os
import sys

OK, NOK, NA = 0, 1, 2

WANTED = os.environ.get("${variable}", "")


def check():
    # Compare the node to WANTED, tell what differs on stderr.
    return OK


def fixable():
    return NA


def fix():
    # Make the node compliant, then check again.
    return check()


def main(argv):
    actions = {"check": check, "fixable": fixable, "fix": fix}
    if len(argv) != 2 or argv[1] not in actions:
        print("usage: %s check|fixable|fix" % argv[0], file=sys.stderr)
        return NA
    return actions[argv[1]]()


if __name__ == "__main__":
    sys.exit(main(sys.argv))
`;
    case "perl":
      return `#!/usr/bin/perl
# ${title}: what the module checks on the node.
#
# Run by the agent with one argument: check, fixable or fix. Exit 0:
# compliant, or fixed; 1: not compliant, or not fixed; 2: not applicable.
# The variables of the rulesets attached are in the environment, as
# OSVC_COMP_<NAME>.

use strict;
use warnings;

use constant { OK => 0, NOK => 1, NA => 2 };

my $wanted = $ENV{'${variable}'} // '';

sub check {
    # Compare the node to $wanted, tell what differs on stderr.
    return OK;
}

sub fixable {
    return NA;
}

sub fix {
    # Make the node compliant, then check again.
    return check();
}

my %actions = (check => \\&check, fixable => \\&fixable, fix => \\&fix);
my $action = $ARGV[0] // '';
if (!exists $actions{$action}) {
    print STDERR "usage: $0 check|fixable|fix\\n";
    exit NA;
}
exit $actions{$action}->();
`;
  }
}

/** The extension of a library file in a language. */
const LIB_EXTENSION: Record<TemplateLanguage, string> = {
  sh: "sh",
  bash: "sh",
  python: "py",
  perl: "pm",
};

/** The name of a library of a module: its name in a form every language imports. */
function libName(name: string): string {
  const base = (name === "" ? "module" : name).replace(/[^A-Za-z0-9]+/g, "_").toLowerCase();
  return /^[a-z_]/.test(base) ? base : `m_${base}`;
}

/**
 * The files a new directory module starts from, in a language: its entry,
 * scripts/main, running the actions with the helpers of a library under lib/,
 * and a README. What a directory adds over a script: files beside the code.
 */
export function directoryTemplate(
  language: TemplateLanguage,
  name: string,
): { path: string; content: string; executable: boolean }[] {
  const title = name === "" ? "<name>" : name;
  const lib = `lib/${libName(name)}.${LIB_EXTENSION[language]}`;
  const variable = variableOf(name);
  const readme = `${title}
${"=".repeat(title.length)}

A directory module: the agent runs scripts/main with check, fixable or fix.
scripts/main loads the helpers of ${lib}; the module may hold any other file,
templates or reference data, next to them.

Exit 0: compliant, or fixed; 1: not compliant, or not fixed; 2: not
applicable. The variables of the rulesets attached are in the environment,
as OSVC_COMP_<NAME>.
`;
  let main: string;
  let library: string;
  switch (language) {
    case "sh":
    case "bash": {
      const shell = language === "sh" ? "/bin/sh" : "/bin/bash";
      main = `#!${shell}
# ${title}: the entry of the module, run by the agent.

here=$(cd "$(dirname "$0")/.." && pwd)
. "$here/${lib}"

case "$1" in
check)   check; exit $? ;;
fixable) fixable; exit $? ;;
fix)     fix; exit $? ;;
*)       echo "usage: $0 check|fixable|fix" >&2; exit 2 ;;
esac
`;
      library = `# Helpers of ${title}, sourced by scripts/main.

wanted=\${${variable}:-}

check() {
    # Compare the node to "$wanted", tell what differs on stderr.
    return 0
}

fixable() {
    return 2
}

fix() {
    # Make the node compliant, then check again.
    check
}
`;
      break;
    }
    case "python":
      main = `#!/usr/bin/env python3
"""${title}: the entry of the module, run by the agent."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lib"))

import ${libName(name)} as module  # noqa: E402


def main(argv):
    actions = {"check": module.check, "fixable": module.fixable, "fix": module.fix}
    if len(argv) != 2 or argv[1] not in actions:
        print("usage: %s check|fixable|fix" % argv[0], file=sys.stderr)
        return module.NA
    return actions[argv[1]]()


if __name__ == "__main__":
    sys.exit(main(sys.argv))
`;
      library = `"""Helpers of ${title}, imported by scripts/main."""

import os

OK, NOK, NA = 0, 1, 2

WANTED = os.environ.get("${variable}", "")


def check():
    # Compare the node to WANTED, tell what differs on stderr.
    return OK


def fixable():
    return NA


def fix():
    # Make the node compliant, then check again.
    return check()
`;
      break;
    case "perl":
      main = `#!/usr/bin/perl
# ${title}: the entry of the module, run by the agent.

use strict;
use warnings;
use FindBin;
use lib "$FindBin::Bin/../lib";

require "${libName(name)}.pm";

my %actions = (check => \\&Module::check, fixable => \\&Module::fixable, fix => \\&Module::fix);
my $action = $ARGV[0] // '';
if (!exists $actions{$action}) {
    print STDERR "usage: $0 check|fixable|fix\\n";
    exit 2;
}
exit $actions{$action}->();
`;
      library = `# Helpers of ${title}, required by scripts/main.

package Module;

use strict;
use warnings;

use constant { OK => 0, NOK => 1, NA => 2 };

my $wanted = $ENV{'${variable}'} // '';

sub check {
    # Compare the node to $wanted, tell what differs on stderr.
    return OK;
}

sub fixable {
    return NA;
}

sub fix {
    # Make the node compliant, then check again.
    return check();
}

1;
`;
      break;
  }
  return [
    { path: "scripts/main", content: main, executable: true },
    { path: lib, content: library, executable: false },
    { path: "README", content: readme, executable: false },
  ];
}
