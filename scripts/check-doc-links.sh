#!/bin/bash
# category: internal-only
# Doc Link Checker — validates Markdown relative links point to existing files

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT"

# Use perl for efficient link extraction — bash line-by-line is too slow
find docs -name "*.md" -not -path "docs/api/*" 2>/dev/null; find . -maxdepth 1 -name "*.md" 2>/dev/null | \
perl -Mstrict -Mwarnings -e '
my $root = $ARGV[0];
my $errors = 0;

sub resolve_path {
  my ($source_dir, $target) = @_;
  $target =~ s/#.*//;
  return "" if $target eq "";

  my $result;
  if ($target =~ /^\//) {
    $result = "$root$target";
  } elsif (!$source_dir || $source_dir eq ".") {
    $result = "$root/$target";
  } else {
    $result = "$root/$source_dir/$target";
  }

  my @parts = split(/\//, $result);
  my @stack;
  for my $p (@parts) {
    next if $p eq "" || $p eq ".";
    if ($p eq "..") {
      pop @stack if @stack;
    } else {
      push @stack, $p;
    }
  }
  return "/" . join("/", @stack);
}

my $source = "";
my $source_dir = "";
while (<STDIN>) {
  chomp;
  my $file = $_;
  $file =~ s/^\.\///;
  $source = $file;
  $source_dir = $source;
  $source_dir =~ s/\/[^\/]+$//;
  $source_dir = "" if $source_dir eq $source;

  open(my $fh, "<", $file) or next;
  my $line_num = 0;
  while (my $line = <$fh>) {
    $line_num++;
    while ($line =~ /\[([^\]]*)\]\(([^)]+)\)/g) {
      my $path = $2;
      next if $path =~ /^(https?|mailto):\/\//;
      next if $path =~ /^#/;
      my $target = $path;
      $target =~ s/#.*//;
      next if $target eq "";

      my $resolved = resolve_path($source_dir, $target);
      next if $resolved eq "";

      if (!-e $resolved) {
        my $rel = $resolved;
        $rel =~ s/^$root\///;
        print "[ERROR] $source:$line_num → $target (file not found)\n";
        $errors++;
      }
    }
  }
  close($fh);
}

if ($errors > 0) {
  print "\n$errors broken link(s) found.\n";
  exit 1;
}
print "All links valid.\n";
exit 0;
' "$ROOT"
