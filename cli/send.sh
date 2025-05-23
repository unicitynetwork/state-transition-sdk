#!/bin/bash

cd ../

# Scan the `txf` folder for .txt files
files=($(ls txf/*.txf 2>/dev/null))

# Check if there are any files to process
if [ ${#files[@]} -eq 0 ]; then
    echo "No transaction flow files found in the txf folder."
    exit 1
fi

# List files and ask the user to choose one by its order number
echo "Available transaction flow files:"
for i in "${!files[@]}"; do
    echo "$((i + 1)). ${files[$i]}"
done

read -p "Select a file by its number: " choice

# Validate the user's choice
if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -le 0 ] || [ "$choice" -gt ${#files[@]} ]; then
    echo "Invalid selection."
    exit 1
fi

# Get the selected file
selected_file="${files[$((choice - 1))]}"

# Prompt for destination address
read -p "Enter Destination Address: " destination_address

read -p "Enter Token Data Hash (optional): " token_data_hash
if [ -n "$token_data_hash" ]; then
    token_data_hash_option="--datahash=$token_data_hash"
else
    token_data_hash_option=""
fi

read -p "Enter Transaction Message (optional): " tx_msg
if [ -n "$tx_msg" ]; then
    tx_msg_option="--msg=$tx_msg"
else
    tx_msg_option=""
fi


read -sp "Enter User Secret: " user_secret
echo

# Set the SECRET environment variable for the local context
export SECRET="$user_secret"

# Execute the command with the selected file as stdin
if output=$(cat "$selected_file" | ./token_manager.js send --dest "$destination_address" "$tx_msg_option" "$token_data_hash_option"); then
    # Rename the file after successful execution
    timestamp=$(date +%s)
    new_filename="${selected_file}.spent.${timestamp}"
    mv "$selected_file" "$new_filename"

    echo "$output"

    echo
    echo "================================================================================"
    # Save the output to the original file name
    echo "$output" > "$selected_file"

    # Provide feedback to the user
    echo "Token was spent successfully using transaction flow file $selected_file to destination $destination_address."
    echo "File $selected_file was updated with the new transaction, but cannot be spent till the destination pointer is resolved into the full state."
    echo "Old transaction flow file is invalid now (unicity will not confirm spend from the old state anymore) and was archived into $new_filename"
else
    echo "$output"
    echo "Failed to send transaction using file $selected_file."
    exit 1
fi
