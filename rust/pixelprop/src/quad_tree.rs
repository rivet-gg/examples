use crate::entities::{Entity, EntityBody, EntityHandle};
use std::cell::Ref;
use std::cell::RefMut;
use std::collections::HashMap;
use std::f64;
use crate::utils::Ray;
use crate::utils::{FloatType, Rect, Vector};

// Based on https://gamedevelopment.tutsplus.com/tutorials/quick-tip-use-quadtrees-to-detect-likely-collisions-in-2d-space--gamedev-374

/// Indicates a dif of a node. This is used to move around, i.e. find the node on a certain side
/// of a node.
enum NodeSide {
    Right,
    TopRight,
    Top,
    TopLeft,
    Left,
    BottomLeft,
    Bottom,
    BottomRight,
    None,
}

/// A rect used to calculate trees. Origin is at the top left, unlike the normal rects where the
/// origin is at the center.
pub struct TreeBounds {
    pub x: FloatType,
    pub y: FloatType,
    pub width: FloatType,
    pub height: FloatType,
}

impl TreeBounds {
    pub fn new(x: FloatType, y: FloatType, width: FloatType, height: FloatType) -> TreeBounds {
        TreeBounds {
            x,
            y,
            width,
            height,
        }
    }

    /// If an entity fits within the bounds.
    fn contains_entity_body(&self, body: &Ref<EntityBody>) -> bool {
        // Check if body contains bounding box if exists, otherwise if it contains the point
        if let Some(ref bounding_rect) = *body.bounding_rect() {
            self.contains_rect(bounding_rect, body.get_pos())
        } else {
            self.contains_point(body.get_pos())
        }
    }

    /// If a rect fits completely within the bounds.
    fn contains_rect(&self, rect: &Rect, offset: &Vector) -> bool {
        return rect.x_lower_extent(offset.x) > self.x
            && rect.x_upper_extent(offset.x) < (self.x + self.width)
            && rect.y_lower_extent(offset.y) > self.y
            && rect.y_upper_extent(offset.y) < (self.y + self.height);
    }

    /// If a rect touches the bounds.
    fn intersects_rect(&self, rect: &Rect, offset: &Vector) -> bool {
        return rect.x_upper_extent(offset.x) > self.x
            && rect.x_lower_extent(offset.x) < (self.x + self.width)
            && rect.y_upper_extent(offset.y) > self.y
            && rect.y_lower_extent(offset.y) < (self.y + self.height);
    }

    /// If a point fits completely within the points.
    fn contains_point(&self, point: &Vector) -> bool {
        return point.x > self.x
            && point.x < (self.x + self.width)
            && point.y > self.y
            && point.y < (self.y + self.height);
    }

    /// Determines which side of the node the ray intersects with *from the inside*. This is used to
    /// know which node the ray should pass through next.
    fn side_intersect(&self, r: &Ray) -> NodeSide {
        // Find the intersections for the bounds of the tree
        // o = origin, d = direction, l = lower, u = upper
        // a = xd, b = yd, c = xo, d = yo; y = (b / a) * (x + c) + d
        // yd = 2, xd = 1, yo = 10, xo = 15
        // y = (yd / xd) * (x - xo) + yo
        // x = (xd / yd) * (y - yo) + xo

        let h = |y: FloatType| (r.dir().x / r.dir().y) * (y - r.origin().y) + r.origin().x;
        let v = |x: FloatType| (r.dir().y / r.dir().x) * (x - r.origin().x) + r.origin().y;

        // Handle any zero values in the vectors so we don't get divide by zero errors
        if r.dir().x == 0. && r.dir().y == 0. {
            return NodeSide::None;
        } else if r.dir().x == 0. {
            return if r.dir().y > 0. {
                NodeSide::Top
            } else {
                NodeSide::Bottom
            };
        } else if r.dir().y == 0. {
            return if r.dir().x > 0. {
                NodeSide::Right
            } else {
                NodeSide::Left
            };
        }

        // Calculate the lower and upper bounds
        let xl = self.x;
        let xu = self.x + self.width;
        let yl = self.y;
        let yu = self.y + self.height;

        // Calculate the intersects
        let ixl = h(xl);
        let ixu = h(xu);
        let iyl = v(yl);
        let iyu = v(yu);

        // Return the sides based on the intersects
        return if r.dir().x > 0. {
            // Right
            if r.dir().y > 0. {
                // Up
                if ixu == iyu {
                    NodeSide::TopRight
                } else if ixu < xu {
                    NodeSide::Top
                } else {
                    NodeSide::Right
                }
            } else {
                // Down
                if ixu == iyl {
                    NodeSide::BottomRight
                } else if ixu < xu {
                    NodeSide::Bottom
                } else {
                    NodeSide::Right
                }
            }
        } else {
            // Left
            if r.dir().y > 0. {
                // Up
                if ixl == iyu {
                    NodeSide::TopLeft
                } else if ixl > xl {
                    NodeSide::Top
                } else {
                    NodeSide::Bottom
                }
            } else {
                // Down
                if ixl == iyl {
                    NodeSide::BottomLeft
                } else if ixl > xl {
                    NodeSide::Bottom
                } else {
                    NodeSide::Left
                }
            }
        };
    }
}

impl PartialEq for TreeBounds {
    fn eq(&self, other: &TreeBounds) -> bool {
        self.x == other.x
            && self.y == other.y
            && self.width == other.width
            && self.height == other.height
    }
}

/// Quad tree for improving performance of physics. Works as a 2D top-down quad tree using.
pub struct QuadTree {
    level: usize,
    entities: Vec<EntityHandle>,
    bounds: TreeBounds,
    nodes: Option<[Box<QuadTree>; 4]>,
    is_sleeping: bool,
}

impl QuadTree {
    const MAX_OBJECTS: usize = 10;
    const MAX_LEVELS: usize = 999; // TODO: Check this value // TODO: Maybe make this smallest size instead of level

    pub fn new(level: usize, bounds: TreeBounds) -> QuadTree {
        QuadTree {
            level,
            bounds,
            entities: Vec::new(),
            nodes: None,
            is_sleeping: false,
        }
    }

    /// If this is the base level of the tree.
    pub fn is_base(&self) -> bool {
        self.level == 0
    }

    /// Clears the quadree of all its objects and nodes.
    pub fn clear(&mut self) {
        // Clear the objects
        self.entities.clear();

        if let Some(ref mut nodes) = self.nodes {
            // Clear child trees
            for tree in nodes.iter_mut() {
                tree.clear();
            }

            // Remove the nodes
            self.nodes = None;
        }
    }

    /// If the tree is already split.
    pub fn is_split(&self) -> bool {
        match self.nodes {
            Some(_) => true,
            None => false,
        }
    }

    /// Splits the tree into 4 subtrees.
    fn split(&mut self) {
        // Check if there are already nodes
        if self.is_split() {
            println!("Already has subnodes.");
            return;
        }

        // Add new nodes
        let sub_level = self.level + 1;
        let x = self.bounds.x;
        let y = self.bounds.y;
        let sub_width = self.bounds.width / 2.;
        let sub_height = self.bounds.height / 2.;

        /*
        Node order:
            2 1
            3 4
        */
        self.nodes = Some([
            Box::new(QuadTree::new(
                sub_level,
                TreeBounds::new(x + sub_width, y, sub_width, sub_height),
            )),
            Box::new(QuadTree::new(
                sub_level,
                TreeBounds::new(x, y, sub_width, sub_height),
            )),
            Box::new(QuadTree::new(
                sub_level,
                TreeBounds::new(x, y + sub_height, sub_width, sub_height),
            )),
            Box::new(QuadTree::new(
                sub_level,
                TreeBounds::new(x + sub_width, y + sub_height, sub_width, sub_height),
            )),
        ]);
    }

    /// Determines which node an entity belongs to. `None` mean that the rectangle can't
    /// fit completely within any of the child bounds. We use an option for the Rect, since we can
    /// treat it as a single point if the rect does not exist.
    fn get_entity_index(&self, entity: &Entity) -> Option<usize> {
        // Forward teh function to `get_index`
        let body = entity.body();
        if let Some(ref nodes) = self.nodes {
            // Iterate through nodes to find one that the rect fits in
            for (i, node) in nodes.iter().enumerate() {
                // Check if the body fits in the node
                if node.bounds.contains_entity_body(&body) {
                    return Some(i);
                }
            }

            // No results
            None
        } else {
            unreachable!("Attempting to get index of node with no subnodes.");
        }
    }

    /// Determines which node is at a specific position. `None` means it can't be found.
    fn get_point_index(&self, vector: &Vector) -> Option<usize> {
        if let Some(ref nodes) = self.nodes {
            // Iterate through nodes to find one that the rect fits in
            for (i, node) in nodes.iter().enumerate() {
                // Check if the body fits in the node
                if node.bounds.contains_point(vector) {
                    return Some(i);
                }
            }

            // No results
            None
        } else {
            unreachable!("Attempting to get index of node with no subnodes.");
        }
    }

    /// Insert an entity into the quad tree. If the node extends capacity it will split the tree.
    pub fn insert(&mut self, entity_handle: EntityHandle) {
        // Awaken the node
        self.is_sleeping = false;

        // Insert the entity into the appropriate node if possible
        if self.is_split() {
            // Get the index for the node to go into
            let entity = entity_handle.borrow();
            if let Some(index) = self.get_entity_index(&*entity) {
                drop(entity);
                if let Some(ref mut nodes) = self.nodes {
                    nodes[index].insert(entity_handle);
                    return;
                } else {
                    unreachable!("Nodes should be split.");
                }
            }
        }

        // Otherwise, insert into this node
        self.entities.push(entity_handle);

        // Check if the tree has to be split
        if self.entities.len() > QuadTree::MAX_OBJECTS && self.level < QuadTree::MAX_LEVELS {
            // Split if needed
            if !self.is_split() {
                self.split();
            }

            // Move the objects into the child trees if needed
            let mut i = 0;
            while i < self.entities.len() {
                // Insert the entity into the appropriate node if possible
                let entity = self.entities[i].borrow();
                if let Some(node_index) = self.get_entity_index(&*entity) {
                    drop(entity);

                    // Remove the entity from this list
                    let entity = self.entities.remove(i);

                    // Insert the entity
                    if let Some(ref mut nodes) = self.nodes {
                        nodes[node_index].insert(entity);
                    } else {
                        unreachable!("Nodes do not exist even though the tree was just split.");
                    }
                } else {
                    // This entity doesn't fit anywhere, skip it
                    i += 1;
                }
            }
        }
    }

    /// Removes an entity from the quad tree
    pub fn remove(&mut self, entity_to_remove: &Entity) -> Option<EntityHandle> {
        // Check if in objects
        for i in 0..self.entities.len() {
            let entity = self.entities[i].borrow();

            // Remove the item if it matches the ID and stop the loop
            if entity.id() == entity_to_remove.id() {
                drop(entity);
                let removed_entity = self.entities.remove(i);
                return Some(removed_entity);
            }
        }

        // Attempt to remove the entity from the appropriate node
        if self.is_split() {
            if let Some(index) = self.get_entity_index(entity_to_remove) {
                if let Some(ref mut nodes) = self.nodes {
                    // Remove the entity and try to return it
                    let removed_entity = nodes[index].remove(entity_to_remove);
                    if removed_entity.is_some() {
                        return removed_entity;
                    }
                } else {
                    unreachable!("Failed to read nodes, even though the tree is split.");
                }
            } else {
                panic!("Failed to remove entity {} because it was not within the object list and not within any nodes.", entity_to_remove.id());
            }
        } else {
            panic!(
                "Failed to remove entity {} because a leaf node was reached.",
                entity_to_remove.id()
            );
        }

        None
    }

    /// Returns the first entity touching a given rect.
    pub fn query_rect<F>(
        &self,
        rect: &Rect,
        offset: &Vector,
        use_bounding_rect: bool,
        check_origin: bool,
        filter: &F,
    ) -> Option<&EntityHandle>
    where
        F: Fn(&Entity) -> bool,
    {
        let mut vec = Vec::new();
        self.query_rect_with_vec(
            &mut vec,
            true,
            rect,
            offset,
            use_bounding_rect,
            check_origin,
            filter,
        );
        vec.into_iter().next()
    }

    /// Returns all of the entities touching a given rect.
    pub fn query_rect_all<F>(
        &self,
        rect: &Rect,
        offset: &Vector,
        use_bounding_rect: bool,
        check_origin: bool,
        filter: &F,
    ) -> Vec<&EntityHandle>
    where
        F: Fn(&Entity) -> bool,
    {
        let mut vec = Vec::new();
        self.query_rect_with_vec(
            &mut vec,
            false,
            rect,
            offset,
            use_bounding_rect,
            check_origin,
            filter,
        );
        vec
    }

    fn query_rect_with_vec<'a, F>(
        &'a self,
        results: &mut Vec<&'a EntityHandle>,
        first_only: bool,
        rect: &Rect,
        offset: &Vector,
        use_bounding_rect: bool,
        check_origin: bool,
        filter: &F,
    ) where
        F: Fn(&Entity) -> bool,
    {
        // Check if any entities intersect
        for entity_handle in self.entities.iter() {
            let entity = entity_handle.borrow();
            let body = entity.body();

            // Filter the entity
            if !filter(&*entity) {
                continue;
            }

            let mut does_intersect = false;

            // Test the origin first, since that's the cheapest operation
            if check_origin {
                does_intersect = rect.contains_point(body.get_pos(), offset);
            }

            // Check the body or bounding box if it hasn't intersected yet
            if !does_intersect {
                if use_bounding_rect {
                    // Check if it intersects the bounding box
                    if let Some(ref bounding_rect) = *body.bounding_rect() {
                        does_intersect = rect.intersects(bounding_rect, offset, body.get_pos());
                    }
                } else {
                    // Check the rects
                    for body_rect in body.rotated_rects().iter() {
                        if rect.intersects(body_rect, offset, body.get_pos()) {
                            does_intersect = true;
                            break;
                        }
                    }
                }
            }

            // Handle intersection
            if does_intersect {
                // Add it
                results.push(entity_handle);

                // Check if should stop
                if first_only {
                    return;
                }
            }
        }

        // Check for intersects in the subnodes
        if let Some(ref nodes) = self.nodes {
            for node in nodes.iter() {
                if node.bounds.intersects_rect(rect, offset) {
                    // Query the node
                    node.query_rect_with_vec(
                        results,
                        first_only,
                        rect,
                        offset,
                        use_bounding_rect,
                        check_origin,
                        filter,
                    );

                    // Stop if the last result
                    if first_only && results.len() > 0 {
                        return;
                    }
                }
            }
        }
    }

    /// Returns a list of all other entities that may be able to collide with the target.
    pub fn retrieve(&self, entity: &Entity) -> Vec<&EntityHandle> {
        // Create an array to use
        let mut entities = Vec::new();

        // Retrieve all of the entities
        self.retrieve_with_vec(&mut entities, entity);

        entities
    }

    /// Called by `retrieve` with a pre-constructed vector to append the values to.
    fn retrieve_with_vec<'a>(&'a self, list: &mut Vec<&'a EntityHandle>, entity: &Entity) {
        // Add all of the objects (not equal to the entity) within this tree
        for handle in self.entities.iter() {
            // Don't add it if the entities are the same
            if handle.borrow().id() == entity.id() {
                continue;
            }

            // Push the handle
            list.push(handle);
        }

        // Retrieve nodes for all the children if split
        if self.is_split() {
            if let Some(index) = self.get_entity_index(entity) {
                // Recursively retrieve nodes
                if let Some(ref nodes) = self.nodes {
                    nodes[index].retrieve_with_vec(list, entity);
                } else {
                    unreachable!("Retrieved index from nodes but there is no list of nodes.");
                }
            }
        }
    }

    /// Performs collisions between all of the entities and against the child nodes.
    pub fn perform_collisions(&self) {
        measure!("Perform collisions");

        // Don't do collisions if sleeping
        if self.is_sleeping {
            return;
        }

        // Iterate through every entity and check for collisions on the same node and child nodes;
        // node that we let the base iterator go all the way through the array since it needs
        // to check all entities against child nodes, even though it won't check against entities
        // on the same node.
        for (i, entity_a_handle) in self.entities.iter().enumerate() {
            measure_verbose!("Collide entity a on same node");

            let entity_a = entity_a_handle.borrow();
            let mut body_a = entity_a.body_mut();

            // Skip if has no body
            if !body_a.has_body() {
                continue;
            }

            // Iterate through entities on the same node to collide with
            let checking_entities = &self.entities[(i + 1)..];
            for entity_b_handle in checking_entities.iter() {
                measure_verbose!("Collide entity b on same node");

                let entity_b = entity_b_handle.borrow();
                let mut body_b = entity_b.body_mut();

                // Skip if has no body
                if !body_b.has_body() {
                    continue;
                }

                // Collide the objects
                {
                    use std::borrow::BorrowMut;
                    EntityBody::collide(body_a.borrow_mut(), body_b.borrow_mut());
                }
            }

            // Iterate through entities in child nodes
            if let Some(ref nodes) = self.nodes {
                measure_verbose!("Perform collisions with child nodes");
                for node in nodes.iter() {
                    node.perform_collision_against(&mut body_a);
                }
            }
        }

        // Perform the collisions on all child nodes.
        if let Some(ref nodes) = self.nodes {
            for node in nodes.iter() {
                node.perform_collisions();
            }
        }
    }

    /// Performs collisions for all entities in this node and child nodes against a single entity.
    /// This is used by `perform_collisions` to prop the child nodes for collisions with an entity
    /// in a parent tree.
    fn perform_collision_against(&self, body_a: &mut RefMut<EntityBody>) {
        measure_verbose!("Perform collisions against entity");

        // Perform against entities on this node
        for entity_b_handle in self.entities.iter() {
            measure_verbose!("Collide entity b against entity");

            let entity_b = entity_b_handle.borrow();
            let mut body_b = entity_b.body_mut();

            // Don't check collisions if has no body
            if !body_a.has_body() {
                continue;
            }

            // Collide the objects
            {
                use std::borrow::BorrowMut;
                EntityBody::collide(body_a.borrow_mut(), body_b.borrow_mut());
            }
        }

        // Perform against child nodes
        if let Some(ref nodes) = self.nodes {
            for node in nodes.iter() {
                node.perform_collision_against(body_a);
            }
        }
    }

    /// Returns the depth of the tree, aka how many subtrees there are. A tree with no nodes
    /// has a depth of 1.
    fn depth(&self) -> usize {
        if let Some(ref nodes) = self.nodes {
            // Add one to the deepest node
            1 + nodes[0]
                .depth()
                .max(nodes[1].depth().max(nodes[2].depth().max(nodes[3].depth())))
        } else {
            // No child nodes, return empty depth
            1
        }
    }

    /// Generate a diagram of the quad tree.
    pub fn draw_tree(&self) -> String {
        // Print out the root entities
        for entity in self.entities.iter() {
            println!("E: {}", entity.borrow().asset());
        }

        // Get the diagram data
        let units_per_node = 2;
        let depth = self.depth();
        let diagram_size = units_per_node * (2 as usize).pow(depth as u32 - 1);

        // Generate the diagram
        let mut diagram = HashMap::new();
        self.draw_tree_with_diagram(&mut diagram, 0, 0, diagram_size);

        // Convert the node to a string
        let mut diagram_str = format!("Depth: {}, size: {}\n", depth, diagram_size);
        let empty_str = "".to_string();
        for y in 0..=diagram_size {
            for x in 0..=diagram_size {
                // Add the str at the position
                let node_str = match diagram.get(&(x, y)) {
                    Some(node_str) => node_str,
                    None => &empty_str,
                };

                // Convert the string to a 2-width and append it to the string
                diagram_str += &format!("{:2}", node_str);
            }

            // Add new line
            diagram_str += "\n";
        }

        diagram_str
    }

    /// Generates a diagram of the quad tree into a hash map.
    fn draw_tree_with_diagram(
        &self,
        diagram: &mut HashMap<(usize, usize), String>,
        x: usize,
        y: usize,
        size: usize,
    ) {
        // Draw the child nodes
        if let Some(ref nodes) = self.nodes {
            let node_size = size / 2;
            nodes[0].draw_tree_with_diagram(diagram, x + node_size, y, node_size); // Top right
            nodes[1].draw_tree_with_diagram(diagram, x, y, node_size); // Top left
            nodes[2].draw_tree_with_diagram(diagram, x, y + node_size, node_size); // Bottom left
            nodes[3].draw_tree_with_diagram(diagram, x + node_size, y + node_size, node_size);
            // Bottom right
        }

        // Add plus signs at corners
        let corner_char = "+".to_string();
        diagram.insert((x, y), corner_char.clone());
        diagram.insert((x + size, y), corner_char.clone());
        diagram.insert((x + size, y + size), corner_char.clone());
        diagram.insert((x, y + size), corner_char.clone());

        // Add lines down the sides of the square
        let horizontal_char = "-".to_string();
        let vertical_char = "|".to_string();
        for i in 1..size {
            diagram.insert((x + i, y), horizontal_char.clone());
            diagram.insert((x + i, y + size), horizontal_char.clone());
            diagram.insert((x, y + i), vertical_char.clone());
            diagram.insert((x + size, y + i), vertical_char.clone());
        }

        // Count the entities that have bodies
        let entity_count = self.entities.len();
        let entities_with_bodies_count = self.entities.iter().fold(0, |count, e| {
            if e.borrow().body().has_body() {
                count + 1
            } else {
                count
            }
        });

        // Write the center part of the diagram
        let offset = size / 2;
        let center_text = format!(
            "{}{}",
            if self.is_sleeping { "S" } else { "A" },
            entities_with_bodies_count
        );
        for (i, c) in center_text.chars().enumerate() {
            diagram.insert((x + offset + i, y + offset), c.to_string());
        }
    }

    /// Update the tree by moving entities to their appropriate positions.
    pub fn update_tree(&mut self, misplaced_entities: &mut Vec<EntityHandle>) {
        measure!("Update tree");

        // Update the child nodes; we do this even if this node is sleeping so children can validate
        // that all of the entities are sleeping. If any of the nodes awake, then we awake this
        // node too.
        let mut child_nodes_sleeping = true;
        if let Some(ref mut nodes) = self.nodes {
            for node in nodes.iter_mut() {
                node.update_tree(misplaced_entities);
                child_nodes_sleeping = child_nodes_sleeping && node.is_sleeping;
            }
        }

        // Determine if the node should go to sleep
        if child_nodes_sleeping {
            // Determine if all the entities are sleeping also
            let mut entities_sleeping = true;
            for entity in self.entities.iter() {
                let entity = entity.borrow();
                let body = entity.body();

                if !body.is_sleeping() {
                    entities_sleeping = false;
                    break;
                }
            }

            // Awaken if needed
            if entities_sleeping {
                // At this point, all the child nodes & the entities are sleeping; can go to sleep
                self.is_sleeping = true;
                return;
            } else {
                // Awaken
                self.is_sleeping = false;
            }
        } else {
            // Awaken
            self.is_sleeping = false;
        }

        // Check if any entities can fit into this node
        {
            measure_verbose!("Check if entity fits");

            let mut i = 0;
            while i < misplaced_entities.len() {
                let entity = misplaced_entities[i].borrow();
                let body = entity.body();

                // Attempt to re-insert the entity if it fits within the bounds or this
                // is the base node
                if self.bounds.contains_entity_body(&body) || self.is_base() {
                    drop(body);
                    drop(entity);

                    // Remove the entity from the list
                    let entity_handle = misplaced_entities.remove(i);

                    // Attempt to insert it into this node
                    self.insert(entity_handle);
                } else {
                    i += 1;
                }
            }
        }

        // Add entities that do not fit into this node to the list
        {
            measure_verbose!("Find misplaced entities");

            let mut i = 0;
            while i < self.entities.len() {
                let entity = self.entities[i].borrow();
                let body = entity.body();

                // Don't update if the entity is static or sleeping
                if body.is_static() || *body.is_sleeping() {
                    i += 1;
                    continue;
                }

                // Move the entity to the misplaced entity list if it doesn't fit within the bounds;
                // this will not add a misplaced entity if it's the base node since entities
                // outside of the map or too large should still be in the tree.
                // If the entity is within the bounds and the node is split, then it will try to
                // insert the entity into a child node. (Otherwise, entities will never go
                // to lower nodes.)
                if !self.bounds.contains_entity_body(&body) && !self.is_base() {
                    drop(body);
                    drop(entity);

                    // Remove the entity from the list
                    let entity_handle = self.entities.remove(i);

                    // Attempt to insert it into this node
                    misplaced_entities.push(entity_handle);

                    continue;
                } else if self.is_split() {
                    if let Some(node_index) = self.get_entity_index(&*entity) {
                        drop(body);
                        drop(entity);

                        // Remove the entity from the list
                        let entity_handle = self.entities.remove(i);

                        // Insert the entity into the appropriate child node
                        if let Some(ref mut nodes) = self.nodes {
                            nodes[node_index].insert(entity_handle);
                        } else {
                            unreachable!("Node is split yet unable to retrieve the nodes.");
                        }

                        continue;
                    }
                }

                // If the entity is not removed, then increment the index
                i += 1;
            }
        }
    }

    /// Returns a stack of nodes at a given position.
    fn node_stack(&self, point: &Vector) -> Vec<&QuadTree> {
        // Find the lowest node that contains the point
        let mut node_stack = Vec::new();
        node_stack.push(self);
        while node_stack.last().unwrap().is_split() {
            // Find the node that contains the point
            let last_node = node_stack.last().unwrap();
            if let Some(origin_node) = last_node.get_point_index(point) {
                if let Some(ref nodes) = last_node.nodes {
                    node_stack.push(&*nodes[origin_node]);
                } else {
                    unreachable!()
                }
            } else {
                // This is the deepest node that contains the point
                break;
            }
        }

        node_stack
    }

    /// Returns the deepest node at a given position.
    fn deepest_node_at(&self, point: &Vector) -> &QuadTree {
        // Find deepest node recursively if is split
        if self.is_split() {
            // Find the node at the index
            if let Some(node_index) = self.get_point_index(point) {
                if let Some(ref nodes) = self.nodes {
                    nodes[node_index].deepest_node_at(point)
                } else {
                    unreachable!();
                }
            } else {
                self
            }
        } else {
            self
        }
    }

    /// Casts a ray within the quad tree and returns the entity handle and a % of the vector length.
    pub fn cast_ray<F>(&self, ray: &Ray, filter: F) -> Option<(&EntityHandle, FloatType)>
    where
        F: Fn(&Entity) -> bool,
    {
        // TODO: Move to using `side_intersect` instead of this hacky method
        // Right now, we're just stepping bit by bit along the ray until we find a new node to trace
        // the ray along, which is really hacky

        // Get the query origin for where to search for a node at
        let mut TEMP_query_origin = ray.origin().clone();

        // Find the query step
        let TEMP_query_step_distance = 5.0;
        let mut TEMP_query_step = ray.dir().clone(); // How much to trace the ray until we find another node
        TEMP_query_step.z = 0.; // We don't care how much it travels up and down, we want it to travel the same distance horizontally
        TEMP_query_step.scale(&(1. / ray.dir().magnitude() * TEMP_query_step_distance)); // Make it step only by a static step distance
        let mut TEMP_total_step_distance = 0.; // How far we've traced the ray, so we know when to stop if the ray is too long

        // Loop until finds node
        let mut closest_distance = f64::INFINITY;
        let mut closest_entity = None;
        'moveOriginLoop: loop {
            // Find the lowest node that contains the point
            let mut node_stack = self.node_stack(&TEMP_query_origin);

            // Find the closest collided entity
            for node in node_stack.iter() {
                // Check collision for each entity
                for entity_handle in node.entities.iter() {
                    let entity = entity_handle.borrow();
                    let body = entity.body();

                    // Filter out the entity if needed
                    if !filter(&*entity) {
                        continue;
                    }

                    // Check collision for each rect
                    for rect in body.rotated_rects() {
                        if let Some(distance) = rect.intersects_ray(ray, body.get_pos()) {
                            // If distance is closer, save the entity
                            if distance < closest_distance {
                                closest_entity = Some(entity_handle);
                                closest_distance = distance;
                            }
                        }
                    }
                }
            }

            // Otherwise, move the origin until it's not in the current node anymore
            while {
                // Move the origin
                TEMP_query_origin.add(&TEMP_query_step, 1.);

                // Determine if we should stop since we've traded to far
                // TODO: Make this work so it actually coordinates to the proper ray length; right now it only is the horizontal length
                TEMP_total_step_distance += TEMP_query_step_distance;
                if TEMP_total_step_distance > *ray.length() {
                    break 'moveOriginLoop; // Stop the outer loop
                }

                // Continue looping until we reach a node that is not in the current node stack;
                // node that we reverse `node_stack` because the node that will match the deepest
                // node is likely to be at the end of the list.
                let deepest_node = self.deepest_node_at(&TEMP_query_origin);
                let should_repeat = node_stack.iter().rev().any(|n| *n == deepest_node);
                should_repeat
            } {}
        }

        // Return the closest entity if exists
        if let Some(closest_entity) = closest_entity {
            return Some((closest_entity, closest_distance));
        } else {
            None
        }
    }
}

impl PartialEq for QuadTree {
    fn eq(&self, other: &QuadTree) -> bool {
        self.level == other.level
            && self.bounds == other.bounds
            && self.entities.len() == other.entities.len()
            && self.nodes.is_some() == other.nodes.is_some()
    }
}
