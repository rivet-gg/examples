#!/bin/bash

# ulimit -c unlimited
# echo "|/app/upload_core_dump.sh %e %p" > /proc/sys/kernel/core_pattern

# /app/generate_core_dump

# echo 'Finished'

# sh

# ===

# # Run the C program
# /app/generate_core_dump &
# pid=$!

# # Wait for the program to exit
# wait $pid
# exit_code=$?

# echo "$pid exit code: $exit_code"

# # Check if the program crashed (non-zero exit code)
# if [ $exit_code -ne 0 ]; then
#     echo 'program crashed'
#     # Generate core dump using gdb
#     gdb -ex "set pagination 0" -ex "attach $pid" -ex "generate-core-file" -ex "detach" -ex "quit" --batch

#   # Upload core dump to S3
#   # aws s3 cp core.<pid> s3://your-bucket/path/
# else
#     echo 'program did not crash'
# fi

# bash

# ===

# cat <<'EOF' > .gdbinit
# set pagination off
# handle SIGSEGV nostop noprint pass
# commands SIGSEGV
#   generate-core-file
#   quit
# end
# EOF

# gdb -ex run -ex "thread apply all bt" -ex "quit" --batch /app/generate_core_dump

gdb -ex "set pagination 0" -ex "run" -ex "generate-core-file" -ex "quit" --batch /app/generate_core_dump

# gdb -ex "set pagination 0" -ex "run" -ex "bt" -ex "info registers" -ex "quit" --batch /app/generate_core_dump

gdb -c core.* -ex "bt" -ex "quit" /app/generate_core_dump

du -h core.*

